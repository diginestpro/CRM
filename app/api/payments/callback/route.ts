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

  // Idempotency: skip if already completed for this invoice.
  const { data: alreadyPaid } = await supabase
    .from("payment_transactions")
    .select("id")
    .eq("invoice_id", orderId)
    .eq("gateway", "safepay")
    .eq("status", "completed")
    .limit(1)
    .maybeSingle()

  if (alreadyPaid) {
    return { success: true, duplicate: true, invoice_id: orderId }
  }

  const finalAmount = amount ?? Number(txn?.amount ?? invoice.total_amount ?? 0)

  // Insert payment row. Unique partial index on (invoice_id, gateway) WHERE
  // status=completed will reject duplicates at the DB level (Postgres 23505).
  const { data: payment, error: payErr } = await supabase.from("invoice_payments").insert({
    invoice_id: orderId,
    amount: finalAmount,
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "SafePay",
    status: "Completed",
  })
    .select()
    .single()

  if (payErr) {
    if (payErr.code === "23505") {
      return { success: true, duplicate: true, invoice_id: orderId }
    }
    return { error: payErr.message }
  }

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
  const tracker = url.searchParams.get("tracker") || ""

  const success = !result.error
  const params = new URLSearchParams()
  if (success) {
    params.set("paid", "true")
  } else {
    params.set("error", String(result.error || "unknown"))
  }
  if (tracker) params.set("tracker", tracker)
  const dest = `/pay/${orderId}?` + params.toString()
  const fullUrl = new URL(dest, url.origin).toString()
  const safeUrl = JSON.stringify(fullUrl)

  // Simple HTML: meta refresh + manual button. Returns to the invoice page.
  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Payment ${success ? "successful" : "failed"}</title>
<meta http-equiv="refresh" content="0;url=${fullUrl}">
<style>
body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#0f172a}
.c{text-align:center;padding:32px;background:white;border-radius:16px;box-shadow:0 10px 25px rgba(15,23,42,.08);max-width:440px}
h1{font-size:22px;margin:0 0 8px}p{color:#64748b;margin:8px 0 0;font-size:14px}
a.btn{display:inline-block;margin-top:16px;padding:12px 24px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:600}
</style></head>
<body><div class="c">
<h1>${success ? "\u2705 Payment successful" : "\u274c Payment failed"}</h1>
<p>${success ? "Returning to your invoice..." : "Returning to your invoice..."}</p>
<a class="btn" href="${fullUrl}">${success ? "View Invoice" : "Back to Invoice"}</a>
</div></body></html>`

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  })

}
