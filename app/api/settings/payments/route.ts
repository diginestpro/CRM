import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Use service role to bypass RLS for global system settings
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// ---------------------------------------------------------------------------
// Form <-> payment_gateways mapping
// ---------------------------------------------------------------------------
// The settings form on /settings/payments uses flat keys like `safepay_api_key`,
// but the payment code in lib/payments.ts reads from the relational
// `payment_gateways` table (api_key, secret_key, webhook_secret, config).
// This file bridges the two so saves actually take effect.
// ---------------------------------------------------------------------------

async function resolveCompanyId(supabase: any): Promise<string | null> {
  const { data: existingGw } = await supabase
    .from("payment_gateways")
    .select("company_id")
    .limit(1)
    .maybeSingle()
  if (existingGw?.company_id) return existingGw.company_id

  const { data: comp } = await supabase
    .from("companies")
    .select("id")
    .limit(1)
    .maybeSingle()
  if (comp?.id) return comp.id

  const { data: created } = await supabase
    .from("companies")
    .insert({ name: "Default Company" })
    .select("id")
    .single()
  return created?.id || null
}

export async function GET() {
  try {
    const supabase = getServiceClient()

    // 1) Primary source of truth: payment_gateways
    const { data: gateways, error: gwError } = await supabase
      .from("payment_gateways")
      .select("*")
    if (gwError) throw gwError

    // 2) Legacy/app-level settings (also where next_public_app_url lives)
    const { data: sysSettings, error: sysError } = await supabase
      .from("system_settings")
      .select("*")
    if (sysError) throw sysError

    const merged: Record<string, any> = {
      stripe_secret_key: "",
      stripe_webhook_secret: "",
      stripe_access_token: "",
      stripe_account_id: "",
      stripe_connected: "",
      paypal_client_id: "",
      paypal_client_secret: "",
      paypal_access_token: "",
      paypal_connected: "",
      safepay_api_key: "",
      safepay_secret_key: "",
      safepay_webhook_secret: "",
      safepay_api_url: "",
      next_public_app_url: "",
    }

    for (const row of gateways || []) {
      const cfg = (row.config as any) || {}
      if (row.gateway_name === "stripe") {
        merged.stripe_secret_key = row.secret_key || ""
        merged.stripe_webhook_secret = row.webhook_secret || ""
        merged.stripe_access_token = row.api_key || ""
        merged.stripe_account_id = (cfg.account_id as string) || ""
        merged.stripe_connected = row.is_active ? "true" : ""
      } else if (row.gateway_name === "paypal") {
        merged.paypal_client_id = row.api_key || ""
        merged.paypal_client_secret = row.secret_key || ""
        merged.paypal_access_token = (cfg.access_token as string) || ""
        merged.paypal_connected = row.is_active ? "true" : ""
      } else if (row.gateway_name === "safepay") {
        merged.safepay_api_key = row.api_key || ""
        merged.safepay_secret_key = row.secret_key || ""
        merged.safepay_webhook_secret = row.webhook_secret || ""
        merged.safepay_api_url = (cfg.api_url as string) || ""
      } else if (row.gateway_name === "app_settings") {
        merged.next_public_app_url = (cfg.app_url as string) || ""
      }
    }

    // Surface any unknown keys from system_settings so nothing is lost
    for (const row of sysSettings || []) {
      if (!(row.key in merged)) merged[row.key] = row.value
    }

    return NextResponse.json({ success: true, settings: merged })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getServiceClient()
    const body = (await req.json()) as Record<string, any>
    console.log("[Settings POST] Saving:", Object.keys(body))

    const companyId = await resolveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json(
        { success: false, error: "Unable to resolve company_id" },
        { status: 500 }
      )
    }

    // Map form keys -> payment_gateways columns. We merge into existing
    // config JSONB so we never clobber unknown fields.
    interface GwUpdate {
      gateway_name: string
      patch: {
        api_key?: string
        secret_key?: string
        webhook_secret?: string
        is_active?: boolean
        config?: Record<string, any>
      }
    }
    const updates: GwUpdate[] = []

    if (
      "stripe_secret_key" in body || "stripe_webhook_secret" in body ||
      "stripe_access_token" in body || "stripe_account_id" in body ||
      "stripe_connected" in body
    ) {
      updates.push({
        gateway_name: "stripe",
        patch: {
          secret_key: body.stripe_secret_key || "",
          webhook_secret: body.stripe_webhook_secret || "",
          api_key: body.stripe_access_token || "",
          is_active: body.stripe_connected === "true",
          config: { account_id: body.stripe_account_id || "" },
        },
      })
    }

    if (
      "paypal_client_id" in body || "paypal_client_secret" in body ||
      "paypal_access_token" in body || "paypal_connected" in body
    ) {
      updates.push({
        gateway_name: "paypal",
        patch: {
          api_key: body.paypal_client_id || "",
          secret_key: body.paypal_client_secret || "",
          config: { access_token: body.paypal_access_token || "" },
          is_active: body.paypal_connected === "true",
        },
      })
    }

    if (
      "safepay_api_key" in body || "safepay_secret_key" in body ||
      "safepay_webhook_secret" in body || "safepay_api_url" in body
    ) {
      const hasKeys = !!(body.safepay_api_key && (body.safepay_secret_key || body.safepay_api_key))
      updates.push({
        gateway_name: "safepay",
        patch: {
          api_key: body.safepay_api_key || "",
          secret_key: body.safepay_secret_key || "",
          webhook_secret: body.safepay_webhook_secret || "",
          config: {
            display_name: "SafePay",
            description: "Pakistani payment gateway with international card support",
            api_url: body.safepay_api_url || "https://sandbox.api.getsafepay.com",
          },
          is_active: hasKeys,
        },
      })
    }

    if ("next_public_app_url" in body) {
      const incoming = String(body.next_public_app_url || "").trim()
      // Only update app_url if the user actually provided a non-empty value.
      // Empty input from a save of OTHER fields would wipe the configured URL.
      if (incoming) {
        updates.push({
          gateway_name: "app_settings",
          patch: {
            is_active: true,
            config: { app_url: incoming },
          },
        })
      }
    }

    for (const { gateway_name, patch } of updates) {
      const { data: existing } = await supabase
        .from("payment_gateways")
        .select("config")
        .eq("company_id", companyId)
        .eq("gateway_name", gateway_name)
        .maybeSingle()

      const mergedConfig = {
        ...((existing?.config as any) || {}),
        ...(patch.config || {}),
      }

      const row: any = {
        company_id: companyId,
        gateway_name,
        updated_at: new Date().toISOString(),
        config: mergedConfig,
      }
      if ("api_key" in patch) row.api_key = patch.api_key
      if ("secret_key" in patch) row.secret_key = patch.secret_key
      if ("webhook_secret" in patch) row.webhook_secret = patch.webhook_secret
      if ("is_active" in patch) row.is_active = patch.is_active

      const { error: upErr } = await supabase
        .from("payment_gateways")
        .upsert(row, { onConflict: "company_id,gateway_name" })
      if (upErr) throw upErr
    }

    // Also mirror to system_settings for backward compat
    const mirrored = Object.entries(body)
      .filter(([k]) => !k.startsWith("__"))
      .map(([key, value]) => ({
        key,
        value: typeof value === "string" ? value : JSON.stringify(value),
        updated_at: new Date().toISOString(),
      }))
    if (mirrored.length > 0) {
      const { error: sysErr } = await supabase
        .from("system_settings")
        .upsert(mirrored, { onConflict: "key" })
      if (sysErr) throw sysErr
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("[Settings Update Error]", e)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
