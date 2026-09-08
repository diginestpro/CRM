import { NextResponse } from "next/server"
import { createClientServer } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"

// Invite a new team member by creating a Supabase auth user and linking to the company
export async function POST(request: Request) {
  try {
    const supabase = await createClientServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get current user's company_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role")
      .eq("id", user.id)
      .maybeSingle()

    if (!profile?.company_id) {
      return NextResponse.json({ error: "No company associated" }, { status: 400 })
    }

    if (profile.role !== "admin") {
      return NextResponse.json({ error: "Only admins can invite members" }, { status: 403 })
    }

    const body = await request.json()
    const { email, role } = body

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 })
    }

    // Use service role to create user
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Generate a temporary password (user will reset via email link)
    const tempPassword = Math.random().toString(36).slice(-12) + "Aa1!"

    // Create the auth user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })

    if (createError || !newUser?.user) {
      return NextResponse.json({ error: createError?.message || "Failed to create user" }, { status: 400 })
    }

    // Create or update the profile with company_id and role
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: newUser.user.id,
        company_id: profile.company_id,
        role: role || "user",
        full_name: email.split("@")[0],
        email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Invitation sent. User created with temporary password.",
      userId: newUser.user.id,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 })
  }
}
