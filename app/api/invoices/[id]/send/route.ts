import { NextResponse } from "next/server"
import { createClientServer } from "@/lib/supabase/server"
import { createClientAdmin } from "@/lib/supabase/client"
import { sendInvoiceEmail } from "@/lib/email"

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

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const companyId = await resolveCompanyId()
    if (!companyId) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    // Verify the invoice belongs to this company
    const supabase = await createClientServer()
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, company_id, status")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle()
    if (!invoice) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 })
    }

    // Auto-update status to Unpaid if currently Draft (so the email flow makes sense)
    if (invoice.status === "Draft") {
      const admin = createClientAdmin()
      await admin.from("invoices").update({ status: "Unpaid" }).eq("id", id)
    }

    const result = await sendInvoiceEmail(companyId, id)
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, messageId: result.messageId })
  } catch (e: any) {
    console.error("[Send Invoice] error:", e)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
