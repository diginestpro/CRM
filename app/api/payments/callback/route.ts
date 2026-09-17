import { NextResponse } from \"next/server\"
import { createClient } from \"@supabase/supabase-js\"
import { sendReceiptEmail } from \"@/lib/email\"
import { processPaymentSuccess } from \"@/lib/payments\"

export const dynamic = \"force-dynamic\"

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
  let orderId = url.searchParams.get(\"order_id\") || url.searchParams.get(\"invoice_id\") || \"\"
  let amount: number | null = null
  let gateway = \"SafePay\"
  let tracker = url.searchParams.get(\"tracker\") || \"\"
  const supabase = getServiceClient()

  console.log(\"[Callback] START method=\" + req.method)

  if (!orderId && tracker) {
    const { data: txn } = await supabase
      .from(\"payment_transactions\")
      .select(\"invoice_id\")
      .eq(\"gateway_transaction_id\", tracker)
      .maybeSingle()
    orderId = txn?.invoice_id || \"\"
  }

  if (body) {
    try {
      let p = JSON.parse(body)
      if (p && typeof p === \"object\" && p.root && typeof p.root === \"object\") {
        p = p.root
      }
      if (p.resource?.purchase_units) {
        gateway = \"PayPal\"
        orderId = orderId || p.resource.purchase_units[0]?.custom_id || \"\"
        const paypalAmt = p.resource.purchase_units[0]?.amount?.value
        if (paypalAmt) amount = parseFloat(paypalAmt)
      } else {
        const inner = p.data || {}
        orderId = orderId || inner?.metadata?.order_id || inner?.order_id || p?.metadata?.order_id || p?.order_id || \"\"
        const rawAmt = inner?.amount ?? p?.amount
        if (typeof rawAmt === \"number\") amount = rawAmt / 100
        else if (typeof rawAmt === \"string\") amount = parseFloat(rawAmt) / 100
        if (!tracker) tracker = inner?.tracker || p?.tracker || \"\"
      }
    } catch (e: any) {
      console.log(\"[Callback] JSON parse error: \" + (e?.message || \"unknown\"))
    }
  }

  console.log(\"[Callback] Parsed orderId=\" + orderId + \" amount=\" + amount + \" tracker=\" + tracker + \" gateway=\" + gateway)

  if (!orderId) return { error: \"order_id not found\" }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(orderId)) {
    return { success: true, duplicate: true, error: \"Invalid UUID\" }
  }

  try {
    const payload = body ? JSON.parse(body) : {}
    const result = await processPaymentSuccess(supabase, orderId, amount || 0, gateway, tracker || orderId, payload)
    return result
  } catch (e: any) {
    console.log(\"[Callback] Update failed: \" + (e?.message || \"Internal error\"))
    return { error: e?.message || \"Internal error\" }
  }
}

export async function POST(req: Request) {
  let body = \"\"
  try {
    body = await req.text()
  } catch (e: any) {
    console.log(\"[Callback] POST body read error: \" + (e?.message || \"unknown\"))
  }
  console.log(\"[Callback] POST received body length=\" + body.length)
  let result
  try {
    result = await markInvoicePaid(req, body)
  } catch (e: any) {
    console.log(\"[Callback] POST crash: \" + (e?.message || \"unknown\") + \"\\\\n\" + (e?.stack || \"\"))
    return NextResponse.json({ error: e?.message || \"Internal error\" }, { status: 500 })
  }
  if (result.error) {
    console.log(\"[Callback] POST error: \" + result.error)
    if (result.duplicate) {
      console.log(\"[Callback] POST duplicate detected, returning 200\")
      return NextResponse.json(result, { status: 200 })
    }
    return NextResponse.json(result, { status: 400 })
  }
  console.log(\"[Callback] POST returning 200 success\")
  return NextResponse.json(result)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const orderId = url.searchParams.get(\"order_id\") || \"\"
  const tracker = url.searchParams.get(\"tracker\") || \"\"

  const supabase = getServiceClient()
  const { data: invoice } = await supabase
    .from(\"invoices\")
    .select(\"status\")
    .eq(\"id\", orderId)
    .maybeSingle()

  const isPaid = invoice?.status === \"Paid\"
  const params = new URLSearchParams()
  
  if (isPaid) {
    params.set(\"paid\", \"true\")
  } else {
    params.set(\"status\", \"processing\")
  }

  if (tracker) params.set(\"tracker\", tracker)
  const dest = \"/pay/\" + orderId + \"?\" + params.toString()
  const fullUrl = new URL(dest, url.origin).toString()

  const title = \"Payment Status\"
  const h1 = isPaid ? \"✅ Payment Successful\" : \"⏳ Verifying Payment...\"
  const p = isPaid ? \"Returning to your invoice...\" : \"We are confirming your payment with SafePay. Please wait a moment.\"
  const btn = isPaid ? \"View Invoice\" : \"Check Status\"

  const html = \"<!doctype html><html><head><meta charset=\\\"utf-8\\\">\\n\" +
    \"<title>\" + title + \"</title>\\n\" +
    \"<meta http-equiv=\\\"refresh\\\" content=\\\"0;url=\" + fullUrl + \"\\\">\\n\" +
    \"<style>\\n\" +
    \"body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#0f172a}\\n\" +
    \".c{text-align:center;padding:32px;background:white;border-radius:16px;box-shadow:0 10px 25px rgba(15,23,42,.08);max-width:440px}\\n\" +
    \"h1{font-size:22px;margin:0 0 8px}p{color:#64748b;margin:8px 0 0;font-size:14px}\\n\" +
    \"a.btn{display:inline-block;margin-top:16px;padding:12px 24px;background:#2563eb;color:white;border-radius:8px;text-decoration:none;font-weight:600}\\n\" +
    \"</style></head>\\n\" +
    \"<body><div class=\\\"c\\\">\\n\" +
    \"<h1>\" + h1 + \"</h1>\\n\" +
    \"<p>\" + p + \"</p>\\n\" +
    \"<a class=\\\"btn\\\" href=\\\"\" + fullUrl + \"\\\">\" + btn + \"</a>\\n\" +
    \"</div></body></html>\"

  return new NextResponse(html, {
    status: 200,
    headers: { \"content-type\": \"text/html; charset=utf-8\" },
  })
}
