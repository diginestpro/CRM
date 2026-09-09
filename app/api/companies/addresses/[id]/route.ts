import { NextResponse } from "next/server"
import { createClientServer } from "@/lib/supabase/server"

/**
 * PATCH  /api/companies/addresses/[id]
 * DELETE /api/companies/addresses/[id]
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

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const companyId = await resolveCompanyId()
  if (!companyId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  const { id } = await context.params
  const supabase = await createClientServer()
  const body = await req.json() || {}

  if (body.is_default) {
    await supabase.from("company_addresses").update({ is_default: false }).eq("company_id", companyId)
  }

  const patch: any = { updated_at: new Date().toISOString() }
  for (const k of ["address_name", "label", "street", "city", "state", "postal_code", "country"]) {
    if (k in body) {
      const v = body[k]
      patch[k === "label" ? "address_name" : k] = v ?? null
    }
  }
  if ("is_default" in body) patch.is_default = !!body.is_default

  const { data, error } = await supabase
    .from("company_addresses")
    .update(patch)
    .eq("id", id)
    .eq("company_id", companyId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ address: data })
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const companyId = await resolveCompanyId()
  if (!companyId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  const { id } = await context.params
  const supabase = await createClientServer()
  const { error } = await supabase
    .from("company_addresses")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}