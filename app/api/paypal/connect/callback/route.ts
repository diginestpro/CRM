import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")

  if (!code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings/payments?error=no_code`)
  }

  try {
    const clientId = process.env.PAYPAL_CLIENT_ID!
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET!
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
    const isSandbox = process.env.PAYPAL_MODE !== "live"
    const baseUrl = isSandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com"

    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=authorization_code&code=" + code
    })

    const tokenData = await tokenResponse.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    await supabase.from("system_settings").upsert([
      { key: "paypal_access_token", value: tokenData.access_token, updated_at: new Date().toISOString() },
      { key: "paypal_connected", value: "true", updated_at: new Date().toISOString() }
    ], { onConflict: "key" })

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings/payments?success=paypal_connected`)
  } catch (e: any) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings/payments?error=` + encodeURIComponent(e.message))
  }
}
