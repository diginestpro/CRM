// Invoice calculation helpers

export interface InvoiceItem {
  description: string
  quantity: number
  unit_price: number
  tax_rate?: number // optional per-line tax
}

export interface InvoiceTotals {
  subtotal: number
  taxAmount: number
  total: number
}

export function calculateInvoiceTotals(items: InvoiceItem[], invoiceTaxRate: number = 0): InvoiceTotals {
  const subtotal = items.reduce((sum, item) => {
    const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
    return sum + lineTotal
  }, 0)

  // Tax on invoice total (single rate applied to entire subtotal)
  const taxAmount = Math.round(subtotal * (Number(invoiceTaxRate) || 0) * 100) / 100
  const total = Math.round((subtotal + taxAmount) * 100) / 100

  return { subtotal: round2(subtotal), taxAmount, total }
}

export function round2(n: number): number {
  return Math.round(Number(n || 0) * 100) / 100
}

export function formatMoney(amount: number, currency: string = "USD"): string {
  const symbols: Record<string, string> = {
    USD: "$", PKR: "Rs", EUR: "\u20ac", GBP: "\u00a3", AED: "AED ", SAR: "SAR ",
  }
  const symbol = symbols[currency] || (currency + " ")
  return `${symbol}${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export interface NextInvoiceNumberResult {
  number: string
  year: number
  seq: number
}

/**
 * Generate the next invoice number for a company.
 * Format: INV-{YEAR}-{SEQ:4}
 * Uses the existing invoices table to compute the next sequence.
 */
export async function generateNextInvoiceNumber(supabase: any, companyId: string): Promise<NextInvoiceNumberResult> {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`

  // Find highest seq for this year
  const { data } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("company_id", companyId)
    .like("invoice_number", `${prefix}%`)
    .order("created_at", { ascending: false })
    .limit(50)

  let maxSeq = 0
  for (const row of data || []) {
    const m = String(row.invoice_number || "").match(new RegExp(`${prefix}(\\d+)`))
    if (m) {
      const n = parseInt(m[1], 10)
      if (!isNaN(n) && n > maxSeq) maxSeq = n
    }
  }
  const seq = maxSeq + 1
  return { number: `${prefix}${String(seq).padStart(4, "0")}`, year, seq }
}

/**
 * Validate an invoice number.
 * Allowed characters: letters, digits, dashes, underscores, dots, spaces.
 */
export function isValidInvoiceNumber(s: string): boolean {
  if (!s) return false
  if (s.length > 50) return false
  return /^[A-Za-z0-9._\- ]+$/.test(s.trim())
}
