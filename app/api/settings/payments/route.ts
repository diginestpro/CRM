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

export async function GET() {
  try {
    const supabase = getServiceClient()
    const { data, error } = await supabase.from("system_settings").select("*")
    if (error) throw error
    return NextResponse.json({ success: true, settings: data || [] })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getServiceClient()
    const body = await req.json()
    console.log("[Settings POST] Saving:", Object.keys(body))

    const updates = Object.entries(body).map(([key, value]) => ({
      key,
      value: typeof value === "string" ? value : JSON.stringify(value),
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabase.from("system_settings").upsert(updates, { onConflict: "key" })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("[Settings Update Error]", e)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
