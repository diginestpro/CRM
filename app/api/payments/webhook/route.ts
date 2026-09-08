import { NextResponse } from "next/server"
import { handlePaymentWebhook } from "@/lib/payments"

// Rate limiting map (in production, use Redis/Upstash)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW = 60_000 // 1 minute
const RATE_LIMIT_MAX = 30 // 30 requests per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(ip)
  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return true
  }
  if (record.count >= RATE_LIMIT_MAX) return false
  record.count++
  return true
}

// Helper: determine the gateway name from headers, URL search params, or body.
function detectGateway(req: Request, body: string): string {
  const headerGateway = req.headers.get("x-payment-gateway")
  if (headerGateway) return headerGateway.toLowerCase()

  const stripeSig = req.headers.get("stripe-signature")
  if (stripeSig) return "stripe"

  const paypalSig =
    req.headers.get("x-paypal-signature") ||
    req.headers.get("paypal-transmission-sig")
  if (paypalSig) return "paypal"

  // SafePay does not send a signature header; we infer from URL search params.
  const url = new URL(req.url)
  if (url.searchParams.has("order_id") || url.searchParams.has("tracker")) {
    return "safepay"
  }

  // Try to sniff the body
  try {
    const parsed = JSON.parse(body)
    if (parsed?.event?.startsWith("payment.")) return "safepay"
    if (parsed?.resource?.purchase_units) return "paypal"
    if (parsed?.type && typeof parsed.type === "string") return "stripe"
  } catch (e) {
    // not JSON
  }

  return "unknown"
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const body = await req.text()
  const signature =
    req.headers.get("stripe-signature") ||
    req.headers.get("x-paypal-signature") ||
    req.headers.get("paypal-transmission-sig") ||
    ""

  const gateway = detectGateway(req, body)

  // Stripe and PayPal require a signature. SafePay uses order_id in the redirect,
  // so we accept those requests as long as they include order_id or tracker.
  if (gateway === "unknown") {
    console.warn(`[Webhook] Rejected request from ${ip} - cannot identify gateway`)
    return NextResponse.json({ error: "Cannot identify gateway" }, { status: 400 })
  }

  if (gateway !== "safepay" && !signature) {
    console.warn(`[Webhook] Rejected ${gateway} request from ${ip} without signature`)
    return NextResponse.json({ error: "Missing signature" }, { status: 401 })
  }

  try {
    await handlePaymentWebhook(gateway, body, signature, req.url)
    return NextResponse.json({ received: true })
  } catch (e: any) {
    console.error("[Webhook] Error:", {
      message: e.message,
      gateway,
      ip,
    })
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}

// Allow GET so SafePay can redirect the user here after payment.
// We treat it as a webhook ping so the invoice gets marked as Paid,
// then send the customer back to the public invoice page.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const orderId = url.searchParams.get("order_id")
  const tracker = url.searchParams.get("tracker")

  if (!orderId && !tracker) {
    return NextResponse.json({ error: "Missing order_id/tracker" }, { status: 400 })
  }

  try {
    await handlePaymentWebhook("safepay", "", "", req.url)
    const invoicePage = `/pay/${orderId}?success=true`
    return NextResponse.redirect(new URL(invoicePage, url.origin))
  } catch (e: any) {
    console.error("[Webhook GET] Error:", e.message)
    const invoicePage = `/pay/${orderId || ""}?error=` + encodeURIComponent(e.message)
    return NextResponse.redirect(new URL(invoicePage, url.origin))
  }
}
