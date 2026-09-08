import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const returnTo = url.searchParams.get("return_to") || "/settings/payments"
  const clientId = process.env.PAYPAL_CLIENT_ID

  if (!clientId) {
    const html = `<!DOCTYPE html>
<html><head><title>PayPal Setup Required</title>
<style>body{font-family:system-ui;max-width:600px;margin:80px auto;padding:20px;color:#1e293b}h1{color:#1e293b}code{background:#f1f5f9;padding:2px 6px;border-radius:4px;color:#6366f1}.box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0}.btn{display:inline-block;background:#3b82f6;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:10px}</style>
</head><body>
<h1>PayPal Connect Not Configured</h1>
<div class="box">
<p><strong>To enable one-click PayPal login, add these to your <code>.env.local</code>:</strong></p>
<pre style="background:#0f172a;color:#f1f5f9;padding:15px;border-radius:6px;overflow-x:auto">PAYPAL_CLIENT_ID=AYxxxxxxxxxxxxxxxxxxxx
PAYPAL_CLIENT_SECRET=EXxxxxxxxxxxxxxxxxxxxx
PAYPAL_MODE=sandbox
NEXT_PUBLIC_APP_URL=http://localhost:3000</pre>
<p>Get your keys from: <a href="https://developer.paypal.com/dashboard/applications/sandbox" target="_blank">PayPal Developer Dashboard</a></p>
<ol>
<li>Go to <strong>Apps & Credentials</strong></li>
<li>Click <strong>Create App</strong>, choose <strong>Merchant</strong></li>
<li>Copy <strong>Client ID</strong> and <strong>Secret</strong></li>
</ol>
</div>
<a class="btn" href="` + returnTo + `">Back to Settings</a>
</body></html>`;
    return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html" } })
  }

  const isSandbox = process.env.PAYPAL_MODE !== "live"
  const authUrl = isSandbox
    ? "https://www.sandbox.paypal.com/signin/authorize"
    : "https://www.paypal.com/signin/authorize"

  const paypalAuthUrl = new URL(authUrl)
  paypalAuthUrl.searchParams.set("client_id", clientId)
  paypalAuthUrl.searchParams.set("response_type", "code")
  paypalAuthUrl.searchParams.set("scope", "openid profile email https://uri.paypal.com/services/invoicing https://uri.paypal.com/services/checkout/orders")
  paypalAuthUrl.searchParams.set("redirect_uri", `${process.env.NEXT_PUBLIC_APP_URL || url.origin}/api/paypal/connect/callback`)
  return NextResponse.redirect(paypalAuthUrl.toString())
}
