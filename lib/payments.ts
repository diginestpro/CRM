import Stripe from "stripe"
import Safepay from "@sfpy/node-core"
import { createClientServer } from "@/lib/supabase/server"
import { getPaymentGateway } from "@/lib/payment-gateways"

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
  const response = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
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
  const supabase = await createClientServer()
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

  let appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  try {
    const appSettingsGw = await getPaymentGateway("app_settings")
    if (appSettingsGw?.config?.app_url) {
      appUrl = appSettingsGw.config.app_url
    }
  } catch (e) {
    // fallback
  }

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
      success_url: `${returnUrl || appUrl + "/invoices/" + invoiceId}?success=true`,
      cancel_url: `${returnUrl || appUrl + "/invoices/" + invoiceId}?canceled=true`,
      metadata: { invoice_id: invoiceId },
    })
    return { url: session.url }
  }

  if (gateway === "paypal") {
    const token = await getPayPalAccessToken()
    const response = await fetch("https://api-m.sandbox.paypal.com/v2/checkout/orders", {
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
          return_url: `${appUrl}/invoices/${invoiceId}?success=true`,
          cancel_url: `${returnUrl || appUrl + "/invoices/" + invoiceId}?canceled=true`,
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

    // Step 3: Build the checkout URL using the SDK
    const checkoutUrl = safepay.checkout.createCheckoutUrl({
      env: environment,
      tbt: authToken,
      tracker: trackerToken,
      source: "hosted",
      order_id: invoiceId,
      redirect_url: `${appUrl}/api/payments/webhook/safepay`,
      cancel_url: `${returnUrl || appUrl + "/invoices/" + invoiceId}?canceled=true`,
    })

    console.log("[SafePay] Checkout URL:", checkoutUrl)

    await supabase.from("payment_transactions").insert({
      invoice_id: invoiceId,
      gateway: "safepay",
      amount: amount,
      currency: currency,
      status: "pending",
      raw_response: sessionResponse,
      metadata: { tracker: trackerToken, checkout_url: checkoutUrl, passport_token_preview: String(authToken).substring(0, 10) + "..." },
    })

    return { url: checkoutUrl }
  }

  throw new Error("Unsupported gateway")
}

export async function handlePaymentWebhook(gateway: string, payload: any, signature: string) {
  const supabase = await createClientServer()
  let invoiceId: string
  let amount: number

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
    invoiceId = payload.resource?.purchase_units[0]?.custom_id
    amount = parseFloat(payload.resource?.purchase_units[0]?.amount?.value)
  } else if (gateway === "safepay") {
    invoiceId = payload.order_id || payload.metadata?.order_id
    amount = payload.amount
  } else {
    throw new Error("Unknown gateway")
  }

  if (!invoiceId) throw new Error("Invoice ID not found in webhook payload")

  const { data: invoice } = await supabase.from("invoices").select("total_amount, currency_code").eq("id", invoiceId).single()

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

  await supabase.from("payment_transactions").insert({
    invoice_id: invoiceId,
    payment_id: payment.id,
    amount: amount,
    currency_code: invoice?.currency_code || "USD",
    status: "completed",
    raw_response: payload,
  })

  const { data: allPayments } = await supabase
    .from("invoice_payments")
    .select("amount")
    .eq("invoice_id", invoiceId)

  const totalPaid = allPayments?.reduce((sum, p) => sum + p.amount, 0) || 0

  const status = totalPaid >= (invoice?.total_amount || 0) ? "Paid" : "Unpaid"
  await supabase.from("invoices").update({ status, amount_paid: totalPaid }).eq("id", invoiceId)

  return { success: true }
}
