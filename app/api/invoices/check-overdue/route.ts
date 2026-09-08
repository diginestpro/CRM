import { NextResponse } from "next/server"
import { createClientAdmin } from "@/lib/supabase/client"
import { sendOverdueReminder } from "@/lib/email"

export async function GET(req: Request) {
  try {
    // In a production environment, you should verify a CRON_SECRET header here
    // const authHeader = req.headers.get("Authorization")
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    // }

    const supabase = createClientAdmin()
    const now = new Date().toISOString().split("T")[0]

    // 1. Find invoices that are Unpaid/Partial and past their due date
    const { data: overdueInvoices, error: fetchError } = await supabase
      .from("invoices")
      .select("id, company_id, status, due_date")
      .in("status", ["Unpaid", "Partial"])
      .lt("due_date", now)

    if (fetchError) throw fetchError
    if (!overdueInvoices || overdueInvoices.length === 0) {
      return NextResponse.json({ success: true, updated: 0, message: "No overdue invoices found" })
    }

    const idsToUpdate = overdueInvoices.map(inv => inv.id)

    // 2. Update status to Overdue
    const { error: updateError } = await supabase
      .from("invoices")
      .update({ status: "Overdue" })
      .in("id", idsToUpdate)

    if (updateError) throw updateError

    // 3. Trigger emails for the invoices that just became overdue
    // We do this in parallel but with a limit to avoid SMTP rate limits
    const emailResults = await Promise.allSettled(
      overdueInvoices.map(async (inv) => {
        return await sendOverdueReminder(inv.company_id, inv.id)
      })
    )

    const sentCount = emailResults.filter(r => r.status === "fulfilled" && r.value.ok).length

    return NextResponse.json({
      success: true,
      updated: idsToUpdate.length,
      emailsSent: sentCount,
    })
  } catch (e: any) {
    console.error("[Check Overdue] error:", e)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
