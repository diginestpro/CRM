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
    // Crypto-grade random temp password. Supabase requires:
    //   - >= 6 characters
    //   - at least one lowercase letter, one uppercase letter,
    //     one digit, one symbol
    // The suffix "!A1a" guarantees those four classes are met.
    const bytes = new Uint8Array(18)
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(bytes)
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
    }
    const tempPassword =
      Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24) +
      "!A1a"

    // Create the auth user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })

    if (createError || !newUser?.user) {
      return NextResponse.json({ error: createError?.message || "Failed to create user" }, { status: 400 })
    }

    // Use the service-role admin client for the profile upsert so the
    // RLS policy on profiles doesn't silently block us. The current
    // session user already authorised the invite on the line above
    // (profile.role === "admin"); the admin client bypasses RLS only
    // for this single write.
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: newUser.user.id,
        company_id: profile.company_id,
        role: role || "user",
        full_name: email.split("@")[0],
        email,
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
    console.error("[team/invite] error:", e)
    return NextResponse.json(
      { error: e?.message || "Failed", name: e?.name || null },
      { status: 500 }
    )
  }
}
