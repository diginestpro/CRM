import { NextResponse } from "next/server"
import { createClientServer } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const supabase = await createClientServer()
    const { searchParams } = new URL(req.url)
    const invoiceId = searchParams.get("id")

    if (invoiceId) {
      const { data: invoice } = await supabase
        .from("invoices")
        .select("id, invoice_number, currency_code, total_amount, amount_paid, status")
        .eq("id", invoiceId)
        .maybeSingle()
      return NextResponse.json({ invoice })
    }

    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, currency_code, total_amount, amount_paid, status")
      .limit(10)
    return NextResponse.json({ invoices })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
