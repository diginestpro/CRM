import { NextResponse } from "next/server"
import { createClientServer } from "@/lib/supabase/server"

// GET /api/emails/[id]/body
//
// Returns { body_html: string } for the given email_queue row. The
// admin queue UI uses this to populate the preview iframe.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    if (!id) return NextResponse.json({ error: "Queue row ID required" }, { status: 400 })

    const supabase = await createClientServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle()
    if (!profile?.company_id) {
      return NextResponse.json({ error: "No company" }, { status: 400 })
    }

    const { data: row, error } = await supabase
      .from("email_queue")
      .select("company_id, body_html")
      .eq("id", id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!row) return NextResponse.json({ error: "Email not found" }, { status: 404 })
    if (row.company_id !== profile.company_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    return NextResponse.json({ body_html: row.body_html || "" })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
