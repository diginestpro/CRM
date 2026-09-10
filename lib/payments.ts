import Stripe from "stripe"
import Safepay from "@sfpy/node-core"
import { createClientServer } from "./supabase/server"
import { getPaymentGateway } from "./payment-gateways"
import { sendReceiptEmail } from "./email"

async function getStripeClient() {
  const gw = await getPaymentGateway("stripe")
  if (!gw) throw new Error("Stripe is not active. Enable it in Settings -> Payment Gateways.")
  const key = gw.secret_key
  if (!key) throw new Error("Stripe Secret Key is not configured. Add it in Settings -> Payment Gateways.")
  return new Stripe(key, { apiVersion: "2026-08-26.dahlia" })
}

async function getPayPalAccessToken() {
  const gw = await getPaymentGateway("paypal")
  if (!gw) throw new Error("PayPal is not active. Enable it in Settings -> Payment Gateways.")

  const clientId = gw.api_key
  const clientSecret = gw.secret_key
  if (!clientId || !clientSecret) throw new Error("PayPal Client ID or Secret is not configured.")

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
  const mode = gw.config?.mode || "sandbox"
  const baseUrl = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  })

  if (!response.ok) throw new Error("Failed to fetch PayPal access token")
  const data = await response.json()
  return data.access_token
}

export async function createPaymentSession(invoiceId: string, gateway: "stripe" | "paypal" | "safepay", returnUrl?: string) {
  // Use admin client so the public /pay/[id] page works for guests
  // (non-logged-in users paying their invoice via the emailed link).
  const { createClientAdmin } = await import("@/lib/supabase/client")
  const supabase = createClientAdmin()
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(`*, clients(*)`)
    .eq("id", invoiceId)
    .single()

  if (error || !invoice) throw new Error("Invoice not found")

  const amount = invoice.total_amount
  // Handle various currency representations: $ -> USD, empty -> USD, Rs -> PKR
  const rawCurrency = (invoice.currency_code || "").trim()
  let currency = rawCurrency
  if (rawCurrency === "$" || rawCurrency === "") currency = "USD"
  else if (rawCurrency === "\u20a8" || rawCurrency.toLowerCase() === "rs") currency = "PKR"
  const clientEmail = invoice.clients?.email

  // URL Priority: app_settings table -> NEXT_PUBLIC_APP_URL
  // No hardcoded fallback - we fail loudly if neither is configured.
  let appUrl = process.env.NEXT_PUBLIC_APP_URL || ""

  try {
    const { getAppSettings } = await import("./payment-gateways")
    const appSettings = await getAppSettings()
    if (appSettings?.app_url) {
      appUrl = appSettings.app_url
    }
  } catch (e) {
    // ignore - keep env var value
  }

  if (!appUrl) {
    throw new Error(
      "App URL is not configured. Set NEXT_PUBLIC_APP_URL in Vercel environment variables, "
      + "or configure app_url in Settings -> Payment Gateways."
    )
  }

  // Normalize: ensure the URL starts with https:// (or http:// for local dev)
  if (!/^https?:\/\//i.test(appUrl)) {
    appUrl = "https://" + appUrl.replace(/^\/+/, "")
  }
  // Strip trailing slash so we do not double up later
  appUrl = appUrl.replace(/\/+$/, "")

  console.log("[Payments] Using appUrl:", appUrl)

  if (gateway === "stripe") {
    const stripe = await getStripeClient()
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Invoice ${invoice.invoice_number}`,
              description: `Payment for services provided to ${invoice.clients?.full_name}`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      customer_email: clientEmail,
      success_url: `${returnUrl || appUrl + "/pay/" + invoiceId}?success=true`,
      cancel_url: `${returnUrl || appUrl + "/pay/" + invoiceId}?canceled=true`,
      metadata: { invoice_id: invoiceId },
    })
    return { url: session.url }
  }

  if (gateway === "paypal") {
    const token = await getPayPalAccessToken()
    const gw = await getPaymentGateway("paypal")
    if (!gw) throw new Error("PayPal is not active.")
    const mode = gw.config?.mode || "sandbox"
    const baseUrl = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"

    const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: { currency_code: "USD", value: amount.toFixed(2) },
            description: `Invoice ${invoice.invoice_number}`,
            custom_id: invoiceId,
          },
        ],
        application_context: {
          return_url: `${returnUrl || appUrl + "/pay/" + invoiceId}?success=true`,
          cancel_url: `${returnUrl || appUrl + "/pay/" + invoiceId}?canceled=true`,
        },
      }),
    })
    const data = await response.json()
    const approveLink = data.links?.find((l: any) => l.rel === "approve")
    return { url: approveLink?.href }
  }

  if (gateway === "safepay") {
    const gw = await getPaymentGateway("safepay")
    if (!gw) throw new Error("SafePay is not active. Enable it in Settings -> Payment Gateways.")

    const secretKey = gw.secret_key
    const publicKey = gw.api_key
    const apiUrl = (gw.config?.api_url || "https://sandbox.api.getsafepay.com").replace(/\/(embedded|components|checkout)\/?$/, "").replace(/\/$/, "")
    const isSandbox = apiUrl.includes("sandbox")
    const environment: "sandbox" | "production" = isSandbox ? "sandbox" : "production"

    if (!secretKey) throw new Error("SafePay Secret Key is not configured. Add it in Settings -> Payment Gateways.")
    if (!publicKey) throw new Error("SafePay Public/API Key is not configured. Add it in Settings -> Payment Gateways.")

    if (!["PKR", "USD"].includes(currency)) {
      throw new Error(`SafePay does not support ${currency}. Supported currencies: PKR, USD. Please use a different payment gateway or update the invoice currency.`)
    }

    // Initialize the official SafePay SDK
    const safepay = new Safepay(secretKey, {
      authType: "secret",
      host: apiUrl,
    })

    // Step 1: Create the payment session (tracker)
    console.log("[SafePay] Step 1: Creating payment session...")
    const sessionResponse = await safepay.payments.session.setup({
      merchant_api_key: publicKey,
      intent: "CYBERSOURCE",
      mode: "payment",
      entry_mode: "raw",
      currency: currency,
      amount: Math.round(amount * 100),
      metadata: { order_id: invoiceId },
    })

    const trackerToken = sessionResponse?.data?.tracker?.token
    if (!trackerToken) {
      throw new Error(`SafePay did not return a tracker token. Response: ${JSON.stringify(sessionResponse)}`)
    }
    console.log("[SafePay] Got tracker:", trackerToken)

    // Step 2: Create a short-lived client auth token (passport)
    console.log("[SafePay] Step 2: Creating passport auth token...")
    const passportResponse = await safepay.client.passport.create()
    const authToken = passportResponse?.data
    if (!authToken) {
      throw new Error(`SafePay did not return an auth token. Response: ${JSON.stringify(passportResponse)}`)
    }
    console.log("[SafePay] Got auth token")

    // Step 3: Build the checkout URL using the SDK.
    // The SDK points to https://sandbox.api.getsafepay.com/embedded/?...
    // (or https://getsafepay.com/embedded/ in production). This is the
    // canonical SafePay checkout page that handles payment + redirect.
    const checkoutUrl = safepay.checkout.createCheckoutUrl({
      env: environment,
      tbt: authToken,
      tracker: trackerToken,
      source: "hosted",
      order_id: invoiceId,
      redirect_url: `${appUrl}/api/payments/callback`,
      cancel_url: `${returnUrl || appUrl + "/pay/" + invoiceId}?canceled=true`,
    })

    console.log("[SafePay] Checkout URL:", checkoutUrl)

    await supabase.from("payment_transactions").insert({
      invoice_id: invoiceId,
      amount: amount,
      currency_code: currency,
      gateway_transaction_id: trackerToken,
      status: "pending",
      raw_response: sessionResponse,
    })

    return { url: checkoutUrl }
  }

  throw new Error("Unsupported gateway")
}

export async function handlePaymentWebhook(gateway: string, payload: any, signature: string, requestUrl?: string) {
  // Use admin client so webhooks work without an authenticated session.
  const { createClientAdmin } = await import("@/lib/supabase/client")
  const supabase = createClientAdmin()
  let invoiceId: string = ""
  let amount: number = 0

  if (gateway === "stripe") {
    const gw = await getPaymentGateway("stripe")
    if (!gw) throw new Error("Stripe is not active.")

    const secret = gw.webhook_secret
    if (!secret) throw new Error("Stripe Webhook Secret not configured.")

    const stripe = new Stripe(gw.secret_key!, { apiVersion: "2026-08-26.dahlia" })
    const event = stripe.webhooks.constructEvent(payload, signature, secret)

    if (event.type === "checkout.session.completed") {
      const session = event.data.object
      invoiceId = session.metadata?.invoice_id || ""
      amount = session.amount_total ? session.amount_total / 100 : 0
    } else return { success: false }
  } else if (gateway === "paypal") {
    const gw = await getPaymentGateway("paypal")
    if (!gw) throw new Error("PayPal is not active.")
    
    const webhookId = gw.webhook_secret // Store PayPal Webhook ID in the webhook_secret column
    if (!webhookId) throw new Error("PayPal Webhook ID not configured. Please add it in Settings -> Payment Gateways.")

    const mode = gw.config?.mode || "sandbox"
    const baseUrl = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"

    const payloadParsed = typeof payload === "string" ? JSON.parse(payload) : payload
    
    const verificationPayload = {
      transmission_id: payloadParsed.id,
      transmission_time: payloadParsed.create_time,
      webhook_id: webhookId,
      webhook_event: payloadParsed.event_type,
    }

    const token = await getPayPalAccessToken()
    const verifyRes = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(verificationPayload),
    })

    if (!verifyRes.ok) {
      const errData = await verifyRes.json().catch(() => ({}))
      throw new Error(`PayPal verification failed: ${errData.message || verifyRes.statusText}`)
    }

    // If invoiceId is still empty, try to resolve it using the tracker token from the URL
    if (!invoiceId && typeof requestUrl === "string" && requestUrl.length > 0) {
      try {
        const url = new URL(requestUrl)
        const tracker = url.searchParams.get("tracker")
        if (tracker) {
          const { data: txn } = await supabase
            .from("payment_transactions")
            .select("invoice_id")
            .eq("gateway_transaction_id", tracker)
            .maybeSingle()
          if (txn && txn.invoice_id) {
            invoiceId = txn.invoice_id
          }
        }
      } catch (e) {
        // ignore URL parse errors
      }
    }

    const verifyData = await verifyRes.json()
    if (verifyData.verification_status !== "SUCCESS") {
      throw new Error(`PayPal verification status: ${verifyData.verification_status}`)
    }

    invoiceId = payloadParsed.resource?.purchase_units[0]?.custom_id
    amount = parseFloat(payloadParsed.resource?.purchase_units[0]?.amount?.value)

  } else if (gateway === "safepay") {
    // SafePay can hit us in two ways:
    //   1) GET redirect with ?order_id=&tracker= in URL
    //   2) POST webhook with JSON body in either the OLD format
    //      { event: "payment.completed", data: { amount, metadata: { order_id } } }
    //      or the NEW format
    //      { type: "payment.succeeded", data: { amount, metadata: { order_id }, tracker, ... } }
    let urlOrderId = ""
    if (requestUrl) {
      try {
        const u = new URL(requestUrl)
        urlOrderId = u.searchParams.get("order_id") || ""
      } catch (e) {}
    }

    // payload may already be parsed by the route or still a string
    const body = typeof payload === "string"
      ? (() => { try { return JSON.parse(payload) } catch { return {} } })()
      : (payload || {})

    // SafePay sends data under .data, but also keep top-level fallback
    const inner = body.data || {}

    invoiceId = urlOrderId
      || inner?.metadata?.order_id
      || inner?.order_id
      || body?.metadata?.order_id
      || body?.order_id
      || ""

    // amount is in cents (smallest currency unit) in SafePay format
    const rawAmount = inner?.amount ?? body?.amount
    if (typeof rawAmount === "number") {
      amount = rawAmount / 100
    } else if (typeof rawAmount === "string") {
      amount = parseFloat(rawAmount) / 100
    } else {
      amount = 0
    }

    // Fallback to pending payment_transaction amount if still 0
    if (!amount && invoiceId) {
      try {
        const { data: txn } = await supabase
          .from("payment_transactions")
          .select("amount")
          .eq("invoice_id", invoiceId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        amount = Number(txn?.amount || 0)
      } catch (e) {
        amount = 0
      }
    }

    console.log("[Webhook][SafePay] invoiceId:", invoiceId, "amount:", amount, "type:", body.type || body.event)
  } else {
    throw new Error("Unknown gateway")
  }

  if (!invoiceId) throw new Error("Invoice ID not found in webhook payload")

  // Idempotency: SafePay may fire the webhook (browser GET + server POST) twice.
  // Skip if we already processed this invoice as completed.
  const { data: existingTxn } = await supabase
    .from("payment_transactions")
    .select("id, status")
    .eq("invoice_id", invoiceId)
    .eq("status", "completed")
    .not("gateway_transaction_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: invoice } = await supabase.from("invoices").select("total_amount, currency_code, status").eq("id", invoiceId).single()

  if (existingTxn) {
    console.log("[Webhook][SafePay] already processed, skipping invoice", invoiceId)
    return { success: true, duplicate: true, invoice_id: invoiceId }
  }

  const { data: payment, error: pErr } = await supabase
    .from("invoice_payments")
    .insert({
      invoice_id: invoiceId,
      amount: amount,
      payment_date: new Date().toISOString().split("T")[0],
      payment_method: gateway === "stripe" ? "Credit Card" : gateway,
      status: "Completed",
    })
    .select()
    .single()

  if (pErr) throw pErr

  // Insert payment_transactions row. Unique partial index will reject duplicates.
  const { error: txnErr } = await supabase.from("payment_transactions").insert({
    invoice_id: invoiceId,
    payment_id: payment.id,
    gateway_transaction_id: invoiceId,
    amount: amount,
    currency_code: invoice?.currency_code || "USD",
    status: "completed",
    raw_response: payload,
  })
  // 23505 = unique violation (duplicate). Safe to ignore - the webhook fired twice.
  if (txnErr && txnErr.code !== "23505") throw txnErr

  const { data: allPayments } = await supabase
    .from("invoice_payments")
    .select("amount")
    .eq("invoice_id", invoiceId)

  const totalPaid = allPayments?.reduce((sum, p) => sum + p.amount, 0) || 0

  const newStatus = totalPaid >= (invoice?.total_amount || 0) ? "Paid" : (totalPaid > 0 ? "Partial" : "Unpaid")
  const statusChangedToPaid = newStatus === "Paid" && invoice?.status !== "Paid"
  await supabase.from("invoices").update({ status: newStatus, amount_paid: totalPaid }).eq("id", invoiceId)

  // Send receipt email when invoice becomes fully paid
  if (statusChangedToPaid && invoiceId) {
    try {
      const { data: invRow } = await supabase.from("invoices").select("company_id").eq("id", invoiceId).maybeSingle()
      if (invRow?.company_id) {
        await sendReceiptEmail(invRow.company_id, invoiceId)
      }
    } catch (e) {
      console.error("[Webhook] receipt email failed:", e)
    }
  }

  return { success: true }
}
