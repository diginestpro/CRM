import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const returnTo = url.searchParams.get("return_to") || "/settings/payments"
  const clientId = process.env.STRIPE_CLIENT_ID || process.env.NEXT_PUBLIC_STRIPE_CLIENT_ID

  if (!clientId) {
    const html = `<!DOCTYPE html>
<html><head><title>Stripe Setup Required</title>
<style>body{font-family:system-ui;max-width:600px;margin:80px auto;padding:20px;color:#1e293b}h1{color:#1e293b}code{background:#f1f5f9;padding:2px 6px;border-radius:4px;color:#6366f1}.box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0}.btn{display:inline-block;background:#3b82f6;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:10px}</style>
</head><body>
<h1>Stripe Connect Not Configured</h1>
<div class="box">
<p><strong>To enable one-click Stripe login, add these to your <code>.env.local</code>:</strong></p>
<pre style="background:#0f172a;color:#f1f5f9;padding:15px;border-radius:6px;overflow-x:auto">STRIPE_CLIENT_ID=ca_xxxxxxxxxxxxxxxxxxxx
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_CLIENT_ID=ca_xxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_APP_URL=http://localhost:3000</pre>
<p>Get your keys from: <a href="https://dashboard.stripe.com/apikeys" target="_blank">https://dashboard.stripe.com/apikeys</a></p>
<p>Then enable Stripe Connect at: <a href="https://dashboard.stripe.com/connect/accounts/overview" target="_blank">Connect Settings</a></p>
</div>
<a class="btn" href="` + returnTo + `">Back to Settings</a>
</body></html>`;
    return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html" } })
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || url.origin}/api/stripe/connect/callback`
  const stripeAuthUrl = new URL("https://connect.stripe.com/oauth/authorize")
  stripeAuthUrl.searchParams.set("response_type", "code")
  stripeAuthUrl.searchParams.set("client_id", clientId)
  stripeAuthUrl.searchParams.set("scope", "read_write")
  stripeAuthUrl.searchParams.set("redirect_uri", redirectUri)
  stripeAuthUrl.searchParams.set("state", "stripe_connect_" + Date.now())
  return NextResponse.redirect(stripeAuthUrl.toString())
}
