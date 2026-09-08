import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const invoiceId = searchParams.get("id")

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  if (invoiceId) {
    const { data: items, error: itemsErr } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, invoice_number, total_amount, currency_code, status")
      .eq("id", invoiceId)
      .maybeSingle()
    return NextResponse.json({
      invoice,
      invoice_items: items,
      itemsCount: items?.length || 0,
      itemsError: itemsErr,
      invoiceError: invErr,
    })
  }

  const { data: items, error } = await supabase
    .from("invoice_items")
    .select("id, invoice_id, description, quantity, unit_price, total_amount")
    .limit(10)
  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select("id, invoice_number, total_amount")
    .limit(5)
  return NextResponse.json({
    itemsCount: items?.length || 0,
    itemsError: error,
    sampleItems: items,
    sampleInvoices: invoices,
    invoiceError: invErr,
  })
}
