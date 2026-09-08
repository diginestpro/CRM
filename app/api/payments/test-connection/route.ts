import { NextResponse } from "next/server"
import Stripe from "stripe"
import Safepay from "@sfpy/node-core"
import { createClientServer } from "@/lib/supabase/server"

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_WINDOW = 60_000
const RATE_MAX = 10

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const rec = rateLimitMap.get(ip)
  if (!rec || now > rec.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW })
    return true
  }
  if (rec.count >= RATE_MAX) return false
  rec.count++
  return true
}

export const dynamic = "force-dynamic"

async function resolveCompanyId() {
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

async function loadGateway(companyId: string, gateway: string) {
  const supabase = await createClientServer()
  const { data } = await supabase
    .from("payment_gateways")
    .select("*")
    .eq("company_id", companyId)
    .eq("gateway_name", gateway)
    .maybeSingle()
  return data
}

async function testStripe(secretKey: string) {
  if (!secretKey) return { ok: false, message: "Secret key is empty", environment: "unknown" }
  const isTest = secretKey.startsWith("sk_test_")
  try {
    const stripe = new Stripe(secretKey, { apiVersion: "2026-08-26.dahlia" })
    const balance = await stripe.balance.retrieve()
    const amt = balance.available?.[0]?.amount ?? 0
    const cur = balance.available?.[0]?.currency?.toUpperCase() ?? ""
    return { ok: true, message: `Connected. Available: ${amt} ${cur}`.trim(), environment: isTest ? "test" : "live" }
  } catch (e: any) {
    return { ok: false, message: e.message || "Stripe rejected the key", environment: isTest ? "test" : "live" }
  }
}

async function testPayPal(clientId: string, clientSecret: string, mode: "sandbox" | "live") {
  if (!clientId || !clientSecret) return { ok: false, message: "Client ID or Secret is empty", environment: mode }
  const baseUrl = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"
  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
    const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    })
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, message: `PayPal ${res.status}: ${text.slice(0, 200)}`, environment: mode }
    }
    const data = await res.json()
    return { ok: true, message: `Connected. Token expires in ${data.expires_in}s`, environment: mode }
  } catch (e: any) {
    return { ok: false, message: e.message || "PayPal request failed", environment: mode }
  }
}

async function testSafePay(apiKey: string, secretKey: string, apiUrl: string) {
  if (!apiKey || !secretKey) return { ok: false, message: "API Key or Secret is empty", environment: "unknown" }
  const baseUrl = (apiUrl || "https://sandbox.api.getsafepay.com").replace(/\/(embedded|components|checkout)\/?$/, "").replace(/\/$/, "")
  const env = baseUrl.includes("sandbox") ? "sandbox" : "production"
  try {
    const safepay = new Safepay(secretKey, { authType: "secret", host: baseUrl })
    const passport = await safepay.client.passport.create()
    if (passport?.data) {
      return { ok: true, message: "Connected. Passport token received.", environment: env }
    }
    return { ok: false, message: "SafePay did not return an auth token", environment: env }
  } catch (e: any) {
    return { ok: false, message: e.response?.data?.message || e.message || "SafePay request failed", environment: env }
  }
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown"
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }
  try {
    const companyId = await resolveCompanyId()
    if (!companyId) {
      return NextResponse.json({ error: "Not authenticated or no company" }, { status: 401 })
    }
    const body = await req.json()
    const gateway = body?.gateway
    if (!["stripe", "paypal", "safepay"].includes(gateway)) {
      return NextResponse.json({ error: "Invalid gateway" }, { status: 400 })
    }
    const row = await loadGateway(companyId, gateway)
    if (!row) {
      return NextResponse.json({ error: `${gateway} is not configured yet` }, { status: 404 })
    }

    let result: { ok: boolean; message: string; environment: string }
    if (gateway === "stripe") {
      result = await testStripe(row.secret_key || "")
    } else if (gateway === "paypal") {
      const cfg = (row.config as any) || {}
      const mode: "sandbox" | "live" = cfg.mode === "live" ? "live" : "sandbox"
      result = await testPayPal(row.api_key || "", row.secret_key || "", mode)
    } else {
      const cfg = (row.config as any) || {}
      result = await testSafePay(row.api_key || "", row.secret_key || "", cfg.api_url || "")
    }

    const supabase = await createClientServer()
    await supabase
      .from("payment_gateways")
      .update({
        config: {
          ...((row.config as any) || {}),
          last_verified_at: new Date().toISOString(),
          last_status: result.ok ? "ok" : "error",
          last_message: result.message,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)

    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[Test Connection] Error:", e.message)
    return NextResponse.json({ error: e.message || "Test failed" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 })
}
