import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendReceiptEmail } from "@/lib/email"

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
  const startTime = Date.now()

  // SafePay sends order_id in different places depending on payload shape.
  let orderId = url.searchParams.get("order_id") || url.searchParams.get("invoice_id") || ""
  let amount: number | null = null
  let gateway = "SafePay"
  let tracker = url.searchParams.get("tracker") || ""
  const supabase = getServiceClient()

  console.log(`[Callback] START method=${req.method}`)

  if (!orderId && tracker) {
    const { data: txn } = await supabase
      .from("payment_transactions")
      .select("invoice_id")
      .eq("gateway_transaction_id", tracker)
      .maybeSingle()
    orderId = txn?.invoice_id || ""
  }

  if (body) {
    try {
      let p = JSON.parse(body)
      // SafePay webhook v2.0.0 wraps the entire event under a "root" key.
      if (p && typeof p === "object" && p.root && typeof p.root === "object") {
        p = p.root
      }
      if (p.resource?.purchase_units) {
        gateway = "PayPal"
        orderId = orderId || p.resource.purchase_units[0]?.custom_id || ""
        const paypalAmt = p.resource.purchase_units[0]?.amount?.value
        if (paypalAmt) {
          amount = parseFloat(paypalAmt)
        }
      } else {
        const inner = p.data || {}
        orderId = orderId
          || inner?.metadata?.order_id
          || inner?.order_id
          || p?.metadata?.order_id
          || p?.order_id
          || ""
        const rawAmt = inner?.amount ?? p?.amount
        if (typeof rawAmt === "number") {
          amount = rawAmt / 100
        } else if (typeof rawAmt === "string") {
          amount = parseFloat(rawAmt) / 100
        }
        if (!tracker) {
          tracker = inner?.tracker || p?.tracker || ""
        }
      }
    } catch (e: any) {
      console.log(`[Callback] JSON parse error: ${e?.message}`)
    }
  }

  console.log(`[Callback] Parsed orderId=${orderId} amount=${amount} tracker=${tracker} gateway=${gateway}`)

  if (!orderId) {
    console.log(`[Callback] ERROR no orderId`)
    return { error: "order_id not found" }
  }

  // Validate UUID format before querying Supabase. If not a valid UUID (e.g.
  // SafePay test payloads use fake IDs like "AX-09u812312"), acknowledge as
  // received so SafePay doesn't retry forever, but log it for debugging.
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(orderId)) {
    console.log(`[Callback] WARNING orderId is not a valid UUID: ${orderId} (likely a test payload). Acknowledging as received.`)
    return { success: true, skipped: "test_payload_invalid_uuid", order_id: orderId }
  }

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, total_amount, amount_paid, status, allows_partial_payments, min_payment")
    .eq("id", orderId)
    .maybeSingle()

  if (invErr) {
    console.log(`[Callback] ERROR invoice query: ${invErr.message}`)
    return { error: invErr.message }
  }
  if (!invoice) {
    console.log(`[Callback] ERROR invoice ${orderId} not found`)
    return { error: `Invoice ${orderId} not found` }
  }

  // --- Idempotency #1: skip if payment_transactions already completed for this tracker ---
  const dedupeKey = tracker || orderId
  const { data: existingTxn } = await supabase
    .from("payment_transactions")
    .select("id, status")
    .eq("invoice_id", orderId)
    .eq("gateway_transaction_id", dedupeKey)
    .eq("status", "completed")
    .maybeSingle()

  if (existingTxn) {
    console.log(`[Callback] SKIP already completed dedupeKey=${dedupeKey}`)
    // Still ensure the invoice is marked Paid (it may have been missed on the first call)
    await supabase
      .from("invoices")
      .update({ status: "Paid", amount_paid: invoice.total_amount })
      .eq("id", orderId)
    return { success: true, duplicate: true, invoice_id: orderId }
  }

  // --- Idempotency #2: skip if invoice_payments has a very recent row (SafePay fires twice) ---
  const { data: existingPayment } = await supabase
    .from("invoice_payments")
    .select("id")
    .eq("invoice_id", orderId)
    .gte("created_at", new Date(Date.now() - 60_000).toISOString())
    .limit(1)
    .maybeSingle()

  if (existingPayment) {
    console.log(`[Callback] SKIP recent invoice_payments row exists for ${orderId}`)
    await supabase
      .from("invoices")
      .update({ status: "Paid", amount_paid: invoice.total_amount })
      .eq("id", orderId)
    return { success: true, duplicate: true, invoice_id: orderId }
  }

  let finalAmount = amount
  if (finalAmount === null || finalAmount === 0) {
    const { data: txn } = await supabase
      .from("payment_transactions")
      .select("amount")
      .eq("invoice_id", orderId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    finalAmount = txn ? Number(txn.amount || 0) : Number(invoice.total_amount || 0)
  }

  console.log(`[Callback] Inserting payment amount=${finalAmount}`)

  const { data: payment, error: payErr } = await supabase.from("invoice_payments").insert({
    invoice_id: orderId,
    amount: finalAmount,
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: gateway,
    status: "Completed",
  })
    .select()
    .single()

  if (payErr) {
    if (payErr.code === "23505") {
      console.log(`[Callback] duplicate payment insert, treating as success`)
      return { success: true, duplicate: true, invoice_id: orderId }
    }
    console.log(`[Callback] ERROR payment insert code=${payErr.code} msg=${payErr.message}`)
    return { error: payErr.message }
  }

  // Update payment_transactions (best-effort)
  if (tracker) {
    await supabase
      .from("payment_transactions")
      .update({ status: "completed", payment_id: payment.id })
      .eq("gateway_transaction_id", tracker)
  }
  await supabase
    .from("payment_transactions")
    .update({ status: "completed" })
    .eq("invoice_id", orderId)
    .eq("status", "pending")

  const { data: allPayments } = await supabase
    .from("invoice_payments")
    .select("amount")
    .eq("invoice_id", orderId)

  const totalPaid = allPayments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0
  const newStatus = totalPaid >= Number(invoice.total_amount || 0) ? "Paid" : (totalPaid > 0 ? "Partial" : "Unpaid")

  const { error: updErr } = await supabase
    .from("invoices")
    .update({ status: newStatus, amount_paid: totalPaid })
    .eq("id", orderId)
  if (updErr) {
    console.log(`[Callback] ERROR invoice update: ${updErr.message}`)
    return { error: updErr.message }
  }

  // Send receipt email asynchronously if invoice just became Paid.
  // We do NOT await this so the webhook returns 200 to SafePay immediately
  // instead of waiting for SMTP (which can take 1-5 seconds).
  if (newStatus === "Paid" && invoice.status !== "Paid") {
    // Fire-and-forget: log result but don't block the response
    sendReceiptEmailAsync(orderId, supabase).catch((err) => {
      console.log(`[Callback] async receipt email crashed for ${orderId}: ${err?.message}`)
    })
  }

  console.log(`[Callback] SUCCESS invoice=${orderId} amount=${finalAmount} status=${newStatus} elapsed=${Date.now() - startTime}ms`)
  return { success: true, invoice_id: orderId, amount: finalAmount, totalPaid, status: newStatus }
}

// Async receipt email sender - does not block the webhook response.
// SafePay's webhook timeout is short (~5s), and SMTP can take that long,
// so we fire the email in the background and return 200 immediately.
async function sendReceiptEmailAsync(orderId: string, supabase: any): Promise<void> {
  try {
    const { data: invoiceWithCompany } = await supabase
      .from("invoices")
      .select("company_id")
      .eq("id", orderId)
      .maybeSingle()
    if (invoiceWithCompany?.company_id) {
      console.log(`[Callback] [async] sending receipt email for invoice=${orderId} company=${invoiceWithCompany.company_id}`)
      const emailResult = await sendReceiptEmail(invoiceWithCompany.company_id, orderId)
      console.log(`[Callback] [async] receipt email result:`, emailResult)
    } else {
      console.log(`[Callback] [async] no company_id on invoice ${orderId}, skipping email`)
    }
  } catch (emailErr: any) {
    console.log(`[Callback] [async] receipt email failed (non-fatal): ${emailErr?.message}`)
  }
}

export async function POST(req: Request) {
  let body = ""
  try {
    body = await req.text()
  } catch (e: any) {
    console.log(`[Callback] POST body read error: ${e?.message}`)
  }
  console.log(`[Callback] POST received body length=${body.length}`)
  let result
  try {
    result = await markInvoicePaid(req, body)
  } catch (e: any) {
    console.log(`[Callback] POST crash: ${e?.message}\n${e?.stack}`)
    // Return 500 for genuine crashes so SafePay knows something went wrong and can retry
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 })
  }
  if (result.error) {
    console.log(`[Callback] POST error: ${result.error}`)
    // Only return 200 (acknowledge as success) when the payment was already
    // processed (duplicate webhook from SafePay firing twice). For genuine
    // errors like "Invoice not found", return 400 so SafePay retries.
    if (result.duplicate) {
      console.log(`[Callback] POST duplicate detected, returning 200`)
      return NextResponse.json(result, { status: 200 })
    }
    // For genuine errors, return 400 - SafePay will mark UNDELIVERED and retry
    return NextResponse.json(result, { status: 400 })
  }
  console.log(`[Callback] POST returning 200 success`)
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
