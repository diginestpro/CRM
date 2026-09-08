import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")

  if (!code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings/payments?error=no_code`)
  }

  try {
    const tokenResponse = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.STRIPE_CLIENT_ID!,
        client_secret: process.env.STRIPE_SECRET_KEY!,
        code: code
      }).toString()
    })

    const tokenData = await tokenResponse.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    await supabase.from("system_settings").upsert([
      { key: "stripe_account_id", value: tokenData.stripe_user_id, updated_at: new Date().toISOString() },
      { key: "stripe_access_token", value: tokenData.access_token, updated_at: new Date().toISOString() },
      { key: "stripe_connected", value: "true", updated_at: new Date().toISOString() }
    ], { onConflict: "key" })

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings/payments?success=stripe_connected`)
  } catch (e: any) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings/payments?error=` + encodeURIComponent(e.message))
  }
}
