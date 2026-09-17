import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { processPaymentSuccess } from "@/lib/payments"
import { checkGatewayStatus } from "@/lib/payment-verification"

const SYNC_SECRET = process.env.PAYMENT_SYNC_SECRET
const CRON_SECRET = process.env.CRON_SECRET

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get("secret")
  const authHeader = req.headers.get("Authorization")
  
  // DEBUGGING: If the environment variable is completely missing from Vercel
  if (!SYNC_SECRET && !CRON_SECRET) {
    return NextResponse.json({ 
      error: "Configuration Missing", 
      details: "Neither PAYMENT_SYNC_SECRET nor CRON_SECRET are found in the server environment. Please check Vercel Environment Variables and Redeploy." 
    }, { status: 500 })
  }

  const isAuthorized = (SYNC_SECRET && secret === SYNC_SECRET) || 
                     (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`)

  if (!isAuthorized) {
    return NextResponse.json({ 
      error: "Unauthorized", 
      details: SYNC_SECRET ? "Secret mismatch. The provided secret does not match the server configuration." : "PAYMENT_SYNC_SECRET is not configured on the server." 
    }, { status: 401 })
  }

  const supabase = getServiceClient()
  console.log("[PaymentSync] Starting reconciliation process...")

  try {
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
        const { data: txn } = await supabase
          .from("payment_transactions")
          .select("*")
          .eq("invoice_id", invoice.id)
          .maybeSingle()

        if (!txn) continue

        const isCompleted = await checkGatewayStatus(txn.gateway_transaction_id, txn.gateway)
        
        if (isCompleted) {
          console.log(`[PaymentSync] Invoice ${invoice.id} found completed on gateway. Processing...`)
          await processPaymentSuccess(supabase, invoice.id, txn.amount, txn.gateway, txn.gateway_transaction_id, { sync: true })
          processedCount++
        } else {
          console.log(`[PaymentSync] Invoice ${invoice.id} is still pending on gateway.`)
        }

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
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
