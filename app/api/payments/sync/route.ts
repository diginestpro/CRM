import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { processPaymentSuccess } from "@/lib/payments"

const SYNC_SECRET = process.env.PAYMENT_SYNC_SECRET

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: Request) {
  // Security: Only allow requests with the correct secret token
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get("secret")

  if (!SYNC_SECRET || secret !== SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401})
  }

  const supabase = getServiceClient()
  console.log("[PaymentSync] Starting reconciliation process...")

  try {
    // 1. Find all invoices that are NOT "Paid"
    const { data: pendingInvoices, error: invErr } = await supabase
      .from("invoices")
      .select("id, total_amount, currency_code, status")
      .neq("status", "Paid")

    if (invErr) throw invErr

    if (!pendingInvoices || pendingInvoices.length === 0) {
      console.log("[PaymentSync] No pending invoices to sync.")
      return NextResponse.json({ message: "No pending invoices found." })
    }

    console.log("[PaymentSync] Checking status for " + pendingInvoices.length + " invoices.")

    let processedCount = 0
    let errorCount = 0

    for (const invoice of pendingInvoices) {
      try {
        // 2. Check if there's a transaction record for this invoice
        const { data: txn } = await supabase
          .from("payment_transactions")
          .select("*")
          .eq("invoice_id", invoice.id)
          .maybeSingle()

        if (!txn) continue // No attempt to pay yet

        // 3. Query the Payment Gateway for the actual status
        // NOTE: In a real production environment, you would call the SafePay/PayPal/Stripe API here
        // using the txn.gateway_transaction_id.
        // For now, we provide the framework. 
        
        // const actualStatus = await checkGatewayStatus(txn.gateway_transaction_id, txn.gateway)
        // if (actualStatus === "completed") {
        //   await processPaymentSuccess(supabase, invoice.id, txn.amount, txn.gateway, txn.gateway_transaction_id, { sync: true })
        //   processedCount++
        // }

        // Placeholder: Since we don't have the Gateway's status-check API keys/methods implemented
        // we log that we would check here.
        console.log("[PaymentSync] Would verify status for invoice " + invoice.id + " with txn " + txn.gateway_transaction_id)

      } catch (e: any) {
        console.error("[PaymentSync] Error processing invoice " + invoice.id + ": " + e?.message)
        errorCount++
      }
    }

    return NextResponse.json({
      message: "Sync completed",
      checked: pendingInvoices.length,
      processed: processedCount,
      errors: errorCount
    })

  } catch (e: any) {
    console.error("[PaymentSync] Fatal error: " + e?.message)
    return NextResponse.json({ error: e?.message }, { status: 500})
  }
}
