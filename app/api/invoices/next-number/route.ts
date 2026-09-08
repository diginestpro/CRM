import { NextResponse } from "next/server"
import { createClientServer } from "@/lib/supabase/server"
import { generateNextInvoiceNumber, isValidInvoiceNumber } from "@/lib/invoice-calc"

export const dynamic = "force-dynamic"

async function resolveCompanyId(): Promise<string | null> {
  const supabase = await createClientServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle()
  return profile?.company_id ?? null
}

export async function GET() {
  try {
    const companyId = await resolveCompanyId()
    if (!companyId) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }
    const supabase = await createClientServer()
    const result = await generateNextInvoiceNumber(supabase, companyId)
    return NextResponse.json({ success: true, ...result, is_valid: isValidInvoiceNumber(result.number) })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}
