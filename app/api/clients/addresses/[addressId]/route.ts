import { NextResponse } from "next/server"
import { createClientServer } from "@/lib/supabase/server"

/**
 * PATCH  /api/clients/addresses/[addressId]   body: { label?, street?, city?, state?, postal_code?, country?, is_default? }
 * DELETE /api/clients/addresses/[addressId]
 */

export async function PATCH(req: Request, context: { params: Promise<{ addressId: string }> }) {
  try {
    const { addressId } = await context.params
    const supabase = await createClientServer()
    const body = await req.json() || {}

    // If marking as default, clear the existing default first
    if (body.is_default) {
      const { data: addr } = await supabase
        .from("client_addresses")
        .select("client_id")
        .eq("id", addressId)
        .maybeSingle()
      if (addr?.client_id) {
        await supabase
          .from("client_addresses")
          .update({ is_default: false })
          .eq("client_id", addr.client_id)
      }
    }

    const patch: any = {}
    for (const k of ["label", "street", "city", "state", "postal_code", "country"]) {
      if (k in body) patch[k] = body[k] ?? null
    }
    if ("is_default" in body) patch.is_default = !!body.is_default
    patch.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from("client_addresses")
      .update(patch)
      .eq("id", addressId)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ address: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ addressId: string }> }) {
  try {
    const { addressId } = await context.params
    const supabase = await createClientServer()
    const { error } = await supabase.from("client_addresses").delete().eq("id", addressId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}