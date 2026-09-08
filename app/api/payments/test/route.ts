import { NextResponse } from "next/server"
import { getPaymentGateway } from "@/lib/payment-gateways"
import Safepay from "@sfpy/node-core"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const gateway = searchParams.get("gateway") || "safepay"

  const results: any[] = []

  try {
    const gw = await getPaymentGateway("safepay")
    if (!gw) {
      return NextResponse.json({ success: false, error: "SafePay not configured" }, { status: 404 })
    }

    const secretKey = gw.secret_key
    const publicKey = gw.api_key
    const apiUrl = (gw.config?.api_url || "https://sandbox.api.getsafepay.com").replace(/\/(embedded|components|checkout)\/?$/, "").replace(/\/$/, "")

    results.push({
      step: "config",
      secretKeyPreview: secretKey ? `${secretKey.substring(0, 10)}...${secretKey.substring(secretKey.length - 4)}` : "MISSING",
      publicKeyPreview: publicKey ? `${publicKey.substring(0, 10)}...${publicKey.substring(publicKey.length - 4)}` : "MISSING",
      apiUrl,
    })

    const safepay = new Safepay(secretKey || "", {
      authType: "secret",
      host: apiUrl,
    })

    // Step 1: session.setup
    let sessionResult: any
    let sessionError: any
    try {
      console.log("[Test] Calling safepay.payments.session.setup...")
      sessionResult = await safepay.payments.session.setup({
        merchant_api_key: publicKey,
        intent: "CYBERSOURCE",
        mode: "payment",
        entry_mode: "raw",
        currency: "PKR",
        amount: 10000,
        metadata: { order_id: "test-" + Date.now() },
      })
      results.push({
        step: "1. session.setup response",
        success: true,
        response: sessionResult,
      })
    } catch (e: any) {
      sessionError = e
      results.push({
        step: "1. session.setup FAILED",
        errorMessage: e.message,
        errorName: e.name,
        errorCode: e.code,
        errorStatus: e.status,
        errorResponse: e.response?.data,
        errorResponseStatus: e.response?.status,
        errorResponseStatusText: e.response?.statusText,
        errorConfig: e.config ? { url: e.config.url, method: e.config.method, data: e.config.data } : null,
        fullErrorString: e.toString(),
        // Get all enumerable own properties
        errorKeys: Object.getOwnPropertyNames(e),
        // Try to extract any response data
        rawError: JSON.stringify(e, Object.getOwnPropertyNames(e)),
      })
    }

    // Step 2: passport.create (only if Step 1 worked)
    if (sessionResult) {
      try {
        console.log("[Test] Calling safepay.client.passport.create...")
        const passportResult = await safepay.client.passport.create()
        results.push({
          step: "2. passport.create response",
          success: true,
          response: passportResult,
        })

        // Step 3: createCheckoutUrl
        const trackerToken = sessionResult?.data?.tracker?.token
        const authToken = passportResult?.data
        if (trackerToken && authToken) {
          const checkoutUrl = safepay.checkout.createCheckoutUrl({
            env: "sandbox",
            tbt: authToken,
            tracker: trackerToken,
            source: "hosted",
            order_id: "test-" + Date.now(),
            redirect_url: "https://example.com/webhook",
            cancel_url: "https://example.com/cancel",
          })
          results.push({
            step: "3. checkoutUrl",
            success: true,
            url: checkoutUrl,
          })
        }
      } catch (e: any) {
        results.push({
          step: "2. passport.create FAILED",
          errorMessage: e.message,
          errorName: e.name,
          errorCode: e.code,
          errorStatus: e.status,
          errorResponse: e.response?.data,
          errorConfig: e.config ? { url: e.config.url, method: e.config.method } : null,
        })
      }
    }

    return NextResponse.json({
      success: !sessionError,
      results,
    })
  } catch (e: any) {
    return NextResponse.json({
      success: false,
      results,
      fatalError: {
        message: e.message,
        stack: e.stack,
        name: e.name,
      },
    }, { status: 500 })
  }
}
