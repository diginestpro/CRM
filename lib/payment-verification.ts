import Stripe from "stripe"
import { getPaymentGateway } from "./payment-gateways"

async function getStripeClient() {
  const gw = await getPaymentGateway("stripe")
  if (!gw) throw new Error("Stripe is not active")
  const key = gw.secret_key
  if (!key) throw new Error("Stripe Secret Key not configured")
  return new Stripe(key, { apiVersion: "2026-08-26.dahlia" })
}

async function getPayPalAccessToken() {
  const gw = await getPaymentGateway("paypal")
  if (!gw) throw new Error("PayPal is not active")
  const clientId = gw.api_key
  const clientSecret = gw.secret_key
  if (!clientId || !clientSecret) throw new Error("PayPal config missing")

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
  if (!response.ok) throw new Error("PayPal token fetch failed")
  const data = await response.json()
  return data.access_token
}

export async function checkGatewayStatus(transactionId: string, gateway: string): Promise<boolean> {
  try {
    if (gateway === "stripe") {
      const stripe = await getStripeClient()
      const paymentIntent = await stripe.paymentIntents.retrieve(transactionId)
      return paymentIntent.status === "succeeded"
    }

    if (gateway === "paypal") {
      const token = await getPayPalAccessToken()
      const gw = await getPaymentGateway("paypal")
      const mode = gw?.config?.mode || "sandbox"
      const baseUrl = mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"
      
      const response = await fetch(`${baseUrl}/v2/checkout/orders/${transactionId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!response.ok) return false
      const data = await response.json()
      return data.status === "COMPLETED"
    }

    if (gateway === "safepay") {
      // SafePay usually requires a specific API key for status checks
      // We implement a basic check here if the API is known, otherwise fallback to false
      // In most SafePay integrations, the webhook is the primary source of truth
      // but we can attempt a query if the gateway config has the API key
      const gw = await getPaymentGateway("safepay")
      if (!gw?.api_key) return false
      
      // Example SafePay status check (pseudo-code as API varies by region)
      const response = await fetch(`https://api.safepay.com/v1/transaction/${transactionId}`, {
        headers: { "Authorization": `Bearer ${gw.api_key}` }
      })
      if (!response.ok) return false
      const data = await response.json()
      return data.status === "Paid" || data.status === "Completed"
    }

    return false
  } catch (e) {
    console.error(`[checkGatewayStatus] Error verifying ${gateway} txn ${transactionId}:`, e)
    return false
  }
}
