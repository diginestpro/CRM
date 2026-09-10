import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { loadFromBlock } from "@/lib/company-address"
import { resolveBranding, buildLegalFooterLinks } from "@/lib/branding"

// Rate limiting per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 20

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

// Validate UUID format to prevent SQL injection / random string lookups
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown"

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  try {
    const { id } = await context.params
    if (!id) return NextResponse.json({ error: "Invoice ID required" }, { status: 400 })

    // Only accept valid UUIDs to prevent enumeration
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const { data: invoice, error: invError } = await supabase
      .from("invoices")
      .select("*, invoice_items(*, services(name))")
      .eq("id", id)
      .maybeSingle()

    if (invError) return NextResponse.json({ error: invError.message }, { status: 500 })
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 })

    const { data: paymentMethods } = await supabase
      .from("invoice_payment_methods")
      .select("payment_method")
      .eq("invoice_id", id)

    // Load active company payment gateways (only those currently
    // enabled in Settings -> Payments). We intersect with the
    // invoice's saved set so a gateway that was deactivated AFTER the
    // invoice was created won't appear on the public pay page.
    let activeNames: string[] = []
    if (invoice.company_id) {
      const { data: activeRows } = await supabase
        .from("payment_gateways")
        .select("gateway_name, is_active")
        .eq("company_id", invoice.company_id)
        .eq("is_active", true)
      activeNames = (activeRows || []).map((r) => r.gateway_name)
    }

    const savedMethods = (paymentMethods?.map(m => m.payment_method) || [])
      .filter((m) => activeNames.includes(m))
    // If the saved set is empty after filtering (e.g. older invoice
    // whose payment_methods rows haven't been populated yet, or all
    // saved gateways are now inactive), fall back to the active set so
    // the client can still pay via SOME gateway.
    invoice.allowed_methods = savedMethods.length > 0 ? savedMethods : activeNames

    // Note: defaults are safe even on older invoices that haven't yet
    // been saved with these columns (e.g. before migration 0009).
    invoice.allows_partial_payments = invoice.allows_partial_payments ?? false
    invoice.min_payment = invoice.min_payment ?? null

    if (invoice.client_id) {
      const { data: cli } = await supabase.from("clients").select("*").eq("id", invoice.client_id).maybeSingle()
      invoice.clients = cli
    }
    if (invoice.company_id) {
      const { data: comp } = await supabase.from("companies").select("*").eq("id", invoice.company_id).maybeSingle()
      invoice.companies = comp
    }

    // Resolve the chosen office address (USA / PK / UAE / ...) for the
    // "From" block shown on /pay and the receipt page.
    invoice.from_block = await loadFromBlock(supabase, invoice)

    // Resolve branding (brand_name + website) once so the pay page,
    // receipt, and email senders can all read it from invoice.branding.
    let appSettings: any = null
    if (invoice.company_id) {
      const { data } = await supabase
        .from("app_settings")
        .select("*")
        .eq("company_id", invoice.company_id)
        .maybeSingle()
      appSettings = data || null
    }
    invoice.branding = resolveBranding({
      company: invoice.companies,
      appSettings,
      footerText: invoice.companies?.footer_text ?? null,
    })
    invoice.footer_links = buildLegalFooterLinks(invoice.branding)

    return NextResponse.json({ invoice })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}

// POST is deprecated - payments now go through /api/payments/checkout with proper auth
export async function POST() {
  return NextResponse.json(
    { error: "This endpoint is deprecated. Use /api/payments/checkout instead." },
    { status: 410 }
  )
}
