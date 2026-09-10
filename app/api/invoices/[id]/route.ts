import { NextResponse } from "next/server"
import { createClientServer } from "@/lib/supabase/server"
import { createClientAdmin } from "@/lib/supabase/client"
import { logActivity } from "@/lib/activity-log"

async function resolveCompanyId(): Promise<string | null> {
  const supabase = await createClientServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle()
  return profile?.company_id ?? null
}

// DELETE /api/invoices/[id]
//
// Deletes a single invoice and ALL of its child rows in one shot:
//   - invoice_items            (line items)
//   - invoice_payment_methods   (gateway choices)
//   - invoice_payments          (payment history)
//   - payment_transactions      (gateway tx log)
//   - activity_logs rows where entity_type='invoice' and entity_id=...
//
// The endpoint refuses with 409 if the invoice has any payments
// that were marked Completed, to prevent accidental data loss.
// The user can override by passing ?force=true (intended for admins).
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    if (!id) return NextResponse.json({ error: "Invoice ID required" }, { status: 400 })

    const companyId = await resolveCompanyId()
    if (!companyId) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    const supabase = await createClientServer()
    const admin = createClientAdmin()

    // Confirm the invoice belongs to this company.
    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .select("id, invoice_number, company_id, status, amount_paid")
      .eq("id", id)
      .maybeSingle()
    if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })
    if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    if (inv.company_id !== companyId) {
      return NextResponse.json({ error: "Invoice does not belong to your company" }, { status: 403 })
    }

    // Refuse if there are completed payments, unless ?force=true.
    const url = new URL(request.url)
    const force = url.searchParams.get("force") === "true"
    if (Number(inv.amount_paid || 0) > 0 && !force) {
      return NextResponse.json({
        success: false,
        error: `Cannot delete: this invoice has ${inv.amount_paid} in completed payments. Pass ?force=true to delete anyway (you'll lose the payment history).`,
      }, { status: 409 })
    }

    // Delete in dependency order (idempotent: each step uses .eq()).
    const steps = [
      { table: "payment_transactions", col: "invoice_id" },
      { table: "invoice_payments", col: "invoice_id" },
      { table: "invoice_payment_methods", col: "invoice_id" },
      { table: "invoice_items", col: "invoice_id" },
      { table: "activity_logs", col: "entity_id", extra: { entity_type: "invoice" } },
      { table: "email_queue", col: "related_id", extra: { related_type: "invoice" } },
    ]
    for (const step of steps) {
      let q = admin.from(step.table).delete().eq(step.col, id)
      if (step.extra) q = q.match(step.extra)
      const { error } = await q
      if (error) {
        return NextResponse.json({
          success: false,
          error: `Failed to delete child rows from ${step.table}: ${error.message}`,
        }, { status: 500 })
      }
    }

    const { error: delErr } = await admin
      .from("invoices")
      .delete()
      .eq("id", id)
    if (delErr) {
      return NextResponse.json({
        success: false,
        error: `Failed to delete invoice: ${delErr.message}`,
      }, { status: 500 })
    }

    await logActivity("invoice_deleted", {
      entity_type: "invoice",
      entity_id: id,
      metadata: { invoice_number: inv.invoice_number, forced: force },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      deleted: { id, invoice_number: inv.invoice_number, forced: force },
    })
  } catch (e: any) {
    console.error("[Invoice DELETE] error:", e)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
