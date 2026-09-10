import { NextResponse } from "next/server"
import { createClientServer } from "@/lib/supabase/server"
import { sendQueueRow } from "@/lib/email"

// POST /api/emails/[id]/resend
//
// Re-runs SMTP for one email_queue row (any status except 'sent').
// Increments `attempts` and updates status / last_error based on
// the outcome.
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    if (!id) return NextResponse.json({ error: "Queue row ID required" }, { status: 400 })

    const supabase = await createClientServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle()
    if (!profile?.company_id) {
      return NextResponse.json({ success: false, error: "No company associated" }, { status: 400 })
    }

    // Verify the row belongs to this company (defence in depth
    // even though we use the admin client for the actual send).
    const { data: row, error: rowErr } = await supabase
      .from("email_queue")
      .select("id, company_id, status")
      .eq("id", id)
      .maybeSingle()
    if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 })
    if (!row) return NextResponse.json({ error: "Email not found" }, { status: 404 })
    if (row.company_id !== profile.company_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (row.status === "sent") {
      return NextResponse.json({
        success: false,
        error: "This email was already sent successfully.",
      }, { status: 409 })
    }

    // Force the row back to 'pending' so sendQueueRow is happy.
    if (row.status === "sending") {
      await supabase.from("email_queue").update({ status: "pending" }).eq("id", id)
    }

    const result = await sendQueueRow(id)
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }
    return NextResponse.json({ success: true, queueId: id, messageId: result.messageId })
  } catch (e: any) {
    console.error("[Email resend] error:", e)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
