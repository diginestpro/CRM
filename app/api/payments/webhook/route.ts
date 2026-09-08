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

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const body = await req.text()
  const signature = req.headers.get("stripe-signature") || req.headers.get("x-paypal-signature") || ""
  const gateway = req.headers.get("x-payment-gateway") || "stripe"

  // Require a signature for all webhooks
  if (!signature) {
    console.warn(`[Webhook] Rejected request from ${ip} without signature`)
    return NextResponse.json({ error: "Missing signature" }, { status: 401 })
  }

  try {
    await handlePaymentWebhook(gateway, body, signature)
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

// Block GET requests
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 })
}
