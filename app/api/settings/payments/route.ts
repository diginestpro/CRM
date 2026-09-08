import { NextResponse } from "next/server"
import { createClientServer } from "@/lib/supabase/server"
import { createClientAdmin } from "@/lib/supabase/client"

// createClientAdmin takes no args; it reads env vars internally.
function getServiceClient() {
  return createClientAdmin()
}

async function resolveCompanyId(): Promise<string | null> {
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

const KNOWN_GATEWAYS = ["stripe", "paypal", "safepay"] as const
type GatewayName = (typeof KNOWN_GATEWAYS)[number]

interface GatewayView {
  is_active: boolean
  api_key: string
  secret_key: string
  webhook_secret: string
  mode: string
  display_name: string
  description: string
  api_url: string
  last_verified_at: string | null
  last_status: string | null
  last_message: string | null
}

function emptyGateway(): GatewayView {
  return {
    is_active: false,
    api_key: "",
    secret_key: "",
    webhook_secret: "",
    mode: "",
    display_name: "",
    description: "",
    api_url: "",
    last_verified_at: null,
    last_status: null,
    last_message: null,
  }
}

function rowToView(row: any): GatewayView {
  const cfg = (row?.config as any) || {}
  return {
    is_active: !!row?.is_active,
    api_key: row?.api_key || "",
    secret_key: row?.secret_key || "",
    webhook_secret: row?.webhook_secret || "",
    mode: cfg.mode || (row?.gateway_name === "safepay" ? "sandbox" : "test"),
    display_name: cfg.display_name || "",
    description: cfg.description || "",
    api_url: cfg.api_url || "",
    last_verified_at: cfg.last_verified_at || null,
    last_status: cfg.last_status || null,
    last_message: cfg.last_message || null,
  }
}

export async function GET() {
  try {
    const companyId = await resolveCompanyId()
    if (!companyId) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    const supabase = await createClientServer()
    const { data: gateways, error: gwError } = await supabase
      .from("payment_gateways")
      .select("*")
      .eq("company_id", companyId)
    if (gwError) throw gwError

    const { data: appSettings, error: asError } = await supabase
      .from("app_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle()
    if (asError) throw asError

    const byName: Record<string, any> = {}
    for (const row of gateways || []) byName[row.gateway_name] = row

    const result: Record<string, any> = {}
    for (const name of KNOWN_GATEWAYS) {
      result[name] = rowToView(byName[name])
    }
    result.app_settings = {
      app_url: appSettings?.app_url || "",
      default_currency_code: appSettings?.default_currency_code || "USD",
      default_timezone: appSettings?.default_timezone || "UTC",
    }

    return NextResponse.json({ success: true, settings: result })
  } catch (e: any) {
    console.error("[Settings GET] Error:", e.message)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}

function validateGatewayInput(gateway: GatewayName, body: any) {
  const errs: string[] = []
  if (gateway === "stripe") {
    if (body.api_key && !body.api_key.startsWith("pk_")) errs.push("Stripe API key should start with pk_")
    if (body.secret_key && !body.secret_key.startsWith("sk_")) errs.push("Stripe secret key should start with sk_")
    if (body.webhook_secret && !body.webhook_secret.startsWith("whsec_")) errs.push("Stripe webhook secret should start with whsec_")
  }
  if (gateway === "paypal") {
    if (body.mode && !["sandbox", "live"].includes(body.mode)) errs.push("PayPal mode must be sandbox or live")
  }
  if (gateway === "safepay") {
    if (body.mode && !["sandbox", "production"].includes(body.mode)) errs.push("SafePay mode must be sandbox or production")
    if (body.api_url && !/^https:\/\//.test(body.api_url)) errs.push("SafePay API URL must start with https://")
  }
  return errs
}

export async function POST(req: Request) {
  try {
    const companyId = await resolveCompanyId()
    if (!companyId) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    const body = await req.json()
    const supabase = await createClientServer()

    const saved: string[] = []

    // ---- App settings ----
    if (body.app_settings && typeof body.app_settings === "object") {
      const as = body.app_settings
      if (as.app_url && !/^https:\/\//.test(as.app_url)) {
        return NextResponse.json({ success: false, error: "App URL must start with https://" }, { status: 400 })
      }
      const row: any = {
        app_url: as.app_url || null,
        default_currency_code: as.default_currency_code || null,
        default_timezone: as.default_timezone || "UTC",
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase
        .from("app_settings")
        .upsert({ company_id: companyId, ...row }, { onConflict: "company_id" })
      if (error) throw error
      saved.push("app_settings")
    }

    // ---- Per-gateway updates ----
    for (const gateway of KNOWN_GATEWAYS) {
      const section = body[gateway]
      if (!section || typeof section !== "object") continue

      const errs = validateGatewayInput(gateway, section)
      if (errs.length) {
        return NextResponse.json({ success: false, error: errs.join("; ") }, { status: 400 })
      }

      const { data: existing } = await supabase
        .from("payment_gateways")
        .select("*")
        .eq("company_id", companyId)
        .eq("gateway_name", gateway)
        .maybeSingle()

      const cfg = (existing?.config as any) || {}
      const mergedConfig = {
        ...cfg,
        display_name: section.display_name ?? cfg.display_name ?? "",
        description: section.description ?? cfg.description ?? "",
        api_url: section.api_url ?? cfg.api_url ?? "",
        mode: section.mode ?? cfg.mode ?? (gateway === "safepay" ? "sandbox" : "test"),
        last_verified_at: cfg.last_verified_at,
        last_status: cfg.last_status,
        last_message: cfg.last_message,
      }

      const row: any = {
        company_id: companyId,
        gateway_name: gateway,
        api_key: section.api_key ?? "",
        secret_key: section.secret_key ?? "",
        webhook_secret: section.webhook_secret ?? "",
        is_active: !!section.is_active,
        config: mergedConfig,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from("payment_gateways")
        .upsert(row, { onConflict: "company_id,gateway_name" })
      if (error) throw error
      saved.push(gateway)
    }

    return NextResponse.json({ success: true, saved })
  } catch (e: any) {
    console.error("[Settings Update Error]", e)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
