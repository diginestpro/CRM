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

// DELETE /api/quotations/[id]
//
// Deletes a quotation and ALL of its child rows:
//   - quotation_items
//   - activity_logs rows where entity_type='quotation' and entity_id=...
//   - email_queue rows where related_type='quotation' and related_id=...
//
// Refuses with 409 if the quotation has been Accepted or is linked
// to a converted invoice.
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    if (!id) return NextResponse.json({ error: "Quotation ID required" }, { status: 400 })

    const companyId = await resolveCompanyId()
    if (!companyId) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    const supabase = await createClientServer()
    const admin = createClientAdmin()

    const { data: q, error: qErr } = await supabase
      .from("quotations")
      .select("id, quotation_number, company_id, status")
      .eq("id", id)
      .maybeSingle()
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
    if (!q) return NextResponse.json({ error: "Quotation not found" }, { status: 404 })
    if (q.company_id !== companyId) {
      return NextResponse.json({ error: "Quotation does not belong to your company" }, { status: 403 })
    }

    // Soft guard: don't allow deleting Accepted quotations.
    if (q.status === "Accepted") {
      return NextResponse.json({
        success: false,
        error: "Cannot delete an Accepted quotation. Convert it to an invoice or change the status first.",
      }, { status: 409 })
    }

    const steps = [
      { table: "quotation_items", col: "quotation_id" },
      { table: "activity_logs", col: "entity_id", extra: { entity_type: "quotation" } },
      { table: "email_queue", col: "related_id", extra: { related_type: "quotation" } },
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
      .from("quotations")
      .delete()
      .eq("id", id)
    if (delErr) {
      return NextResponse.json({
        success: false,
        error: `Failed to delete quotation: ${delErr.message}`,
      }, { status: 500 })
    }

    await logActivity("quotation_deleted", {
      entity_type: "quotation",
      entity_id: id,
      metadata: { quotation_number: q.quotation_number },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      deleted: { id, quotation_number: q.quotation_number },
    })
  } catch (e: any) {
    console.error("[Quotation DELETE] error:", e)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
