import { NextResponse } from "next/server"
import { createClientServer } from "@/lib/supabase/server"

/**
 * GET    /api/companies/addresses          -> list addresses for the current company
 * POST   /api/companies/addresses          -> create { address_name, street, city, state, postal_code, country, is_default }
 * PATCH  /api/companies/addresses/[id]     -> update
 * DELETE /api/companies/addresses/[id]     -> remove
 */

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

export async function GET() {
  const companyId = await resolveCompanyId()
  if (!companyId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  const supabase = await createClientServer()
  const { data, error } = await supabase
    .from("company_addresses")
    .select("*")
    .eq("company_id", companyId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ addresses: data || [] })
}

export async function POST(req: Request) {
  const companyId = await resolveCompanyId()
  if (!companyId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  const supabase = await createClientServer()
  const body = await req.json() || {}

  if (body.is_default) {
    await supabase.from("company_addresses").update({ is_default: false }).eq("company_id", companyId)
  }

  const { data, error } = await supabase
    .from("company_addresses")
    .insert({
      company_id: companyId,
      address_name: body.address_name || body.label || null,
      street: body.street || null,
      city: body.city || null,
      state: body.state || null,
      postal_code: body.postal_code || null,
      country: body.country || null,
      is_default: !!body.is_default,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ address: data })
}