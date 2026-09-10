import { NextResponse } from "next/server"
import { createClientServer } from "@/lib/supabase/server"
import { safeUpsert } from "@/lib/supabase/safe-write"

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
  try {
    const companyId = await resolveCompanyId()
    if (!companyId) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }
    const supabase = await createClientServer()
    const { data, error } = await supabase
      .from("smtp_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle()
    if (error) throw error
    return NextResponse.json({ success: true, settings: data || {} })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const companyId = await resolveCompanyId()
    if (!companyId) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }
    const body = await request.json()
    const supabase = await createClientServer()

    const row: any = {
      company_id: companyId,
      host: body.host || body.smtp_host,
      port: parseInt(String(body.port || body.smtp_port || "587"), 10),
      username: body.username || body.smtp_user || null,
      password: body.password || body.smtp_password || null,
      encryption: body.encryption || body.smtp_secure || "tls",
      from_name: body.from_name || body.smtp_from_name || null,
      from_email: body.from_email || body.smtp_from_email || null,
      updated_at: new Date().toISOString(),
    }

    if (!row.host || !row.from_email) {
      return NextResponse.json(
        { success: false, error: "SMTP host and from email are required" },
        { status: 400 }
      )
    }

    const { error } = await safeUpsert(supabase, "smtp_settings", row, { onConflict: "company_id" })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error("[SMTP Save Error]", e)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
