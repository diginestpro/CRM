import { NextResponse } from "next/server"
import { createPaymentSession } from "@/lib/payments"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { invoiceId, gateway, returnUrl } = body

    if (!invoiceId) throw new Error("Missing invoiceId")
    if (!gateway) throw new Error("Missing gateway")

    console.log("[Checkout] Request received", { invoiceId, gateway, returnUrl })
    const result = await createPaymentSession(invoiceId, gateway, returnUrl)
    console.log("[Checkout] Success", { gateway, hasUrl: !!result.url })
    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[Checkout Error Full Details]", {
      message: e.message,
      stack: e.stack,
      name: e.name,
      response: e.response?.data || e.response?.statusText,
      config: e.config ? { url: e.config.url, method: e.config.method } : null,
    })
    return NextResponse.json(
      {
        error: e.message || "Payment session failed",
        gateway: e.gateway,
        response: e.response?.data || null,
        debug: process.env.NODE_ENV === "development" ? { stack: e.stack } : undefined,
      },
      { status: 500 }
    )
  }
}
