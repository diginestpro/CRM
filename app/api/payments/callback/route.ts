import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

/**
 * Backup webhook endpoint at /api/payments/callback.
 * Why: The Next.js 16 / Vercel edge was rewriting /api/payments/webhook into
 * /login/api/payments/webhook for non-authenticated requests. Some environments
 * also strip the /api/payments prefix from redirect URLs. This route lives at a
 * different path so any such rewriting won't reach it.
 *
 * Behavior: accepts GET and POST
 *  - POST: standard webhook (with optional JSON body)
 *  - GET: SafePay redirect-back with order_id + tracker in the query string
 */
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function markInvoicePaid(req: Request, body: string) {
  const url = new URL(req.url)

  // SafePay sends order_id in different places depending on payload shape.
  let orderId = url.searchParams.get("order_id") || url.searchParams.get("invoice_id") || ""
  let amount: number | null = null
  if (body) {
    try {
      const p = JSON.parse(body)
      const inner = p.data || {}
      orderId = orderId
        || inner?.metadata?.order_id
        || inner?.order_id
        || p?.metadata?.order_id
        || p?.order_id
        || ""
      const rawAmt = inner?.amount ?? p?.amount
      if (typeof rawAmt === "number") amount = rawAmt / 100
      else if (typeof rawAmt === "string") amount = parseFloat(rawAmt) / 100
    } catch (e) { /* ignore */ }
  }

  if (!orderId) {
    return { error: "order_id not found" }
  }

  const supabase = getServiceClient()

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, total_amount, amount_paid, status")
    .eq("id", orderId)
    .maybeSingle()
  if (invErr) return { error: invErr.message }
  if (!invoice) return { error: `Invoice ${orderId} not found` }

  const { data: txn } = await supabase
    .from("payment_transactions")
    .select("amount")
    .eq("invoice_id", orderId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const finalAmount = amount ?? Number(txn?.amount ?? invoice.total_amount ?? 0)

  const { error: payErr } = await supabase.from("invoice_payments").insert({
    invoice_id: orderId,
    amount: finalAmount,
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "SafePay",
    status: "Completed",
  })
  if (payErr) return { error: payErr.message }

  const { data: allPayments } = await supabase
    .from("invoice_payments")
    .select("amount")
    .eq("invoice_id", orderId)

  const totalPaid = allPayments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0
  const newStatus = totalPaid >= Number(invoice.total_amount || 0) ? "Paid" : "Unpaid"

  const { error: updErr } = await supabase
    .from("invoices")
    .update({ status: newStatus, amount_paid: totalPaid })
    .eq("id", orderId)
  if (updErr) return { error: updErr.message }

  await supabase
    .from("payment_transactions")
    .update({ status: "completed" })
    .eq("invoice_id", orderId)
    .eq("status", "pending")

  return { success: true, invoice_id: orderId, amount, totalPaid, status: newStatus }
}

export async function POST(req: Request) {
  const body = await req.text()
  const result = await markInvoicePaid(req, body)
  if (result.error) {
    return NextResponse.json(result, { status: 400 })
  }
  return NextResponse.json(result)
}

export async function GET(req: Request) {
  const result = await markInvoicePaid(req, "")
  const url = new URL(req.url)
  const orderId = url.searchParams.get("order_id") || ""

  if (result.error) {
    return NextResponse.redirect(
      new URL(`/pay/${orderId}?error=` + encodeURIComponent(result.error), url.origin)
    )
  }
  return NextResponse.redirect(new URL(`/pay/${orderId}?success=true`, url.origin))
}
