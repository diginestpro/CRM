import { NextResponse } from \"next/server\"
import { createClient } from \"@supabase/supabase-js\"
import { processPaymentSuccess } from \"@/lib/payments\"
import { checkGatewayStatus } from \"@/lib/payment-verification\"

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
  // Security: Allow requests with the correct secret token OR Vercel's CRON_SECRET header
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get(\"secret\")
  const authHeader = req.headers.get(\"Authorization\")
  
  const isAuthorized = (SYNC_SECRET && secret === SYNC_SECRET) || 
                     (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`)

  if (!isAuthorized) {
    return NextResponse.json({ error: \"Unauthorized\" }, { status: 401 })
  }

  const supabase = getServiceClient()
  console.log(\"[PaymentSync] Starting reconciliation process...\")

  try {
    // 1. Find all invoices that are NOT \"Paid\"
    const { data: pendingInvoices, error: invErr } = await supabase
      .from(\"invoices\")
      .select(\"id, total_amount, currency_code, status\")
      .neq(\"status\", \"Paid\")

    if (invErr) throw invErr

    if (!pendingInvoices || pendingInvoices.length === 0) {
      console.log(\"[PaymentSync] No pending invoices to sync.\")
      return NextResponse.json({ message: \"No pending invoices found.\" })
    }

    console.log(\"[PaymentSync] Checking status for \" + pendingInvoices.length + \" invoices.\")

    let processedCount = 0
    let errorCount = 0

    for (const invoice of pendingInvoices) {
      try {
        // 2. Check if there's a transaction record for this invoice
        const { data: txn } = await supabase
          .from(\"payment_transactions\")
          .select(\"*\")
          .eq(\"invoice_id\", invoice.id)
          .maybeSingle()

        if (!txn) continue // No attempt to pay yet

        // 3. Query the Payment Gateway for the actual status
        const isCompleted = await checkGatewayStatus(txn.gateway_transaction_id, txn.gateway)
        
        if (isCompleted) {
          console.log(`[PaymentSync] Invoice ${invoice.id} found completed on gateway. Processing...`)
          await processPaymentSuccess(supabase, invoice.id, txn.amount, txn.gateway, txn.gateway_transaction_id, { sync: true })
          processedCount++
        } else {
          console.log(`[PaymentSync] Invoice ${invoice.id} is still pending on gateway.`)
        }

      } catch (e: any) {
        console.error(\"[PaymentSync] Error processing invoice \" + invoice.id + \": \" + e?.message)
        errorCount++
      }
    }

    return NextResponse.json({
      message: \"Sync completed\",
      checked: pendingInvoices.length,
      processed: processedCount,
      errors: errorCount
    })

  } catch (e: any) {
    console.error(\"[PaymentSync] Fatal error: \" + e?.message)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
