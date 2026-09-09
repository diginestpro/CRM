import { NextResponse } from "next/server"
import { createClientServer } from "@/lib/supabase/server"

/**
 * GET  /api/clients/[id]/addresses        -> list addresses
 * POST /api/clients/[id]/addresses        -> create { label, street, city, state, postal_code, country, is_default }
 */

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const supabase = await createClientServer()
    const { data, error } = await supabase
      .from("client_addresses")
      .select("*")
      .eq("client_id", id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ addresses: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: clientId } = await context.params
    const supabase = await createClientServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const body = await req.json()
    const { label, street, city, state, postal_code, country, is_default } = body || {}

    // Resolve company_id from the client row to keep RLS consistent
    const { data: client, error: cErr } = await supabase
      .from("clients")
      .select("company_id")
      .eq("id", clientId)
      .maybeSingle()
    if (cErr || !client) {
      return NextResponse.json({ error: cErr?.message || "Client not found" }, { status: 404 })
    }

    if (is_default) {
      // Clear other defaults first
      await supabase
        .from("client_addresses")
        .update({ is_default: false })
        .eq("client_id", clientId)
    }

    const { data, error } = await supabase
      .from("client_addresses")
      .insert({
        client_id: clientId,
        company_id: client.company_id,
        label: label || null,
        street: street || null,
        city: city || null,
        state: state || null,
        postal_code: postal_code || null,
        country: country || null,
        is_default: !!is_default,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ address: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}