// ============================================================
// lib/company-address.ts
//
// Centralised helpers for resolving the "From" address block on
// an invoice / quotation / email / pay-page / receipt.
//
// Why this lives in its own module:
//   - The same logic is needed in:
//       * the authed invoice detail page (server component)
//       * the public invoice API (used by /pay/[id])
//       * the email renderer (lib/email.ts)
//       * the print/PDF layout (components/billing/invoice-print.tsx)
//       * the receipt page
//     so we keep it DRY in one place.
// ============================================================

export interface CompanyAddressRow {
  id: string
  company_id: string
  address_name: string
  street: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  is_default: boolean | null
  created_at?: string
  updated_at?: string
}

export interface CompanyRow {
  id: string
  name: string
  logo_url?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  tagline?: string | null
  brand_color?: string | null
  footer_text?: string | null
  tax_number?: string | null
}

/**
 * Resolved "From" block ready for rendering.
 * Always provides a multi-line address string + helper fields.
 */
export interface FromBlock {
  // Display name (e.g. company name) shown as the headline.
  name: string
  // The office label, e.g. "USA Office" — null if no specific address chosen.
  address_name: string | null
  // Pre-built multi-line HTML for the email wrapper.
  address_html: string
  // Pre-built multi-line plain text for receipt / print.
  address_lines: string[]
  // Email + phone (always from the company, not the office).
  email: string | null
  phone: string | null
  // The raw rows, in case a caller wants to drill down further.
  company: CompanyRow | null
  address: CompanyAddressRow | null
}

/**
 * Resolves the final "From" block for a given invoice-like object.
 *
 * Priority:
 *   1. The invoice's explicitly chosen `company_address` row (its
 *      `street`, `city`, `state`, `postal_code`, `country`).
 *   2. The invoice's chosen `company_address` row, but using the
 *      office's email/phone if present (currently we always fall
 *      back to the company row for contact info because the office
 *      table does not store contact info).
 *   3. The company's top-level address columns (legacy fallback).
 *
 * `company` and `address` may be null; the function is defensive.
 */
export function resolveFromBlock(opts: {
  company?: CompanyRow | null
  address?: CompanyAddressRow | null
}): FromBlock {
  const company = opts.company || null
  const address = opts.address || null

  const name = company?.name || "Your Company"
  const email = company?.email ?? null
  const phone = company?.phone ?? null

  // 3 pieces of address data, joined with newlines.
  let street = ""
  let cityLine = ""
  let country = ""

  if (address) {
    street = address.street || ""
    cityLine = [address.city, address.state, address.postal_code]
      .filter(Boolean)
      .join(", ")
    country = address.country || ""
  } else if (company) {
    // Final fallback: the company row's own top-level address columns.
    street = company.address || ""
    cityLine = [company.city, company.state, company.zip]
      .filter(Boolean)
      .join(", ")
    country = company.country || ""
  }

  const address_lines = [street, cityLine, country].filter((l) => l && l.trim().length > 0)
  const address_html = address_lines.length
    ? address_lines.map(escapeHtml).join("<br/>")
    : ""

  return {
    name,
    address_name: address?.address_name ?? null,
    address_html,
    address_lines,
    email,
    phone,
    company,
    address,
  }
}

// Minimal HTML escape for the bits we splice into email body strings.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Convenience helper for the (Supabase / pg) caller: returns the
 * shape you need to pass into `resolveFromBlock`.  The Supabase
 * admin client is used in both email and PDF paths, so this lives
 * here as a thin async wrapper for callers that already have one.
 *
 * The function looks up the invoice's company_address_id; if that
 * is null it picks the company's default address.
 */
export async function loadFromBlock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  invoice: { company_id?: string | null; company_address_id?: string | null }
): Promise<FromBlock> {
  let company: CompanyRow | null = null
  let address: CompanyAddressRow | null = null

  if (invoice.company_id) {
    const { data: comp } = await supabase
      .from("companies")
      .select("*")
      .eq("id", invoice.company_id)
      .maybeSingle()
    company = comp || null
  }

  // Resolve address: explicit choice → company default → null.
  if (invoice.company_address_id) {
    const { data: a } = await supabase
      .from("company_addresses")
      .select("*")
      .eq("id", invoice.company_address_id)
      .maybeSingle()
    address = a || null
  }
  if (!address && company?.id) {
    const { data: def } = await supabase
      .from("company_addresses")
      .select("*")
      .eq("company_id", company.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    address = def || null
  }

  return resolveFromBlock({ company, address })
}
