import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

// Public endpoint - returns current invoice status without auth.
// Used by the public pay page for live polling.
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: "Invoice ID required" }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const { data, error } = await supabase
      .from("invoices")
      .select("id, status, total_amount, amount_paid, due_date, currency_code, invoice_number")
      .eq("id", id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: "Invoice not found" }, { status: 404 })

    const balance = Math.max(0, Number(data.total_amount || 0) - Number(data.amount_paid || 0))
    return NextResponse.json({
      status: data.status,
      total_amount: data.total_amount,
      amount_paid: data.amount_paid,
      balance,
      due_date: data.due_date,
      invoice_number: data.invoice_number,
      currency_code: data.currency_code,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
