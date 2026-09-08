import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Get all SMTP settings
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
    const { data, error } = await supabase.from("system_settings").select("*").like("key", "smtp_%")
    if (error) throw error
    return NextResponse.json({ success: true, settings: data || [] })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}

// Save SMTP settings
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const updates = Object.entries(body).map(([key, value]) => ({
      key: "smtp_" + key,
      value: String(value),
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabase.from("system_settings").upsert(updates, { onConflict: "key" })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
