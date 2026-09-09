// ============================================================
// lib/branding.ts

// Single source of truth for the production brand name + URL.
// Update these (or set app_settings.brand_name / company_website)
// to rename the product. Everything falls back to these when the
// database doesn't override.
export const BRAND_NAME_FALLBACK = "DigiNest Solutions"
export const BRAND_WEBSITE_FALLBACK = "https://diginest.pro"

//
// Centralised helpers for resolving the company's brand identity
// (display name, website, footer text, copyright year) at render
// time. Everything the user sees across the app (emails, pay page,
// receipt, PDF print, navbar / sidebar) should pull from these
// helpers so that changing the company name in Settings -> Company
// automatically updates every surface.
//
// Resolution order:
//   - app_settings.brand_name     -> if set, use it
//   - companies.name                -> otherwise, the company name
//   - "DigiNest Solutions"          -> final fallback (production)
//
// Resolution order for the website:
//   - app_settings.company_website -> if set, use it
//   - "https://diginest.pro"        -> final fallback (production)
// ============================================================

export interface BrandingRow {
  // Effective display name shown everywhere.
  brand_name: string
  // Effective website URL used in footers / "Powered by" links.
  company_website: string
  // Footer text (e.g. "Thank you for your business").
  footer_text: string | null
  // Copyright year (string for safe interpolation in templates).
  copyright_year: string
  // Whether the current effective name was overridden by app_settings
  // (true) or falls back to companies.name (false).
  is_overridden: boolean
}

/**
 * Resolve the brand identity for a given company / app_settings row.
 * Pass the raw rows from Supabase; missing fields are handled with
 * safe defaults.
 */
export function resolveBranding(opts: {
  company?: { name?: string | null } | null
  appSettings?: {
    brand_name?: string | null
    company_website?: string | null
  } | null
  footerText?: string | null
}): BrandingRow {
  const overrideName = (opts.appSettings?.brand_name || "").trim()
  const companyName = (opts.company?.name || "").trim()
  const brand_name =
    overrideName || companyName || "DigiNest Solutions"

  const overrideSite = (opts.appSettings?.company_website || "").trim()
  const company_website =
    overrideSite || "https://diginest.pro"

  // Strip a trailing slash so we can append paths consistently.
  const cleanSite = company_website.replace(/\/+$/, "")

  return {
    brand_name,
    company_website: cleanSite,
    footer_text: opts.footerText ?? null,
    copyright_year: String(new Date().getFullYear()),
    is_overridden: !!overrideName,
  }
}

/**
 * Convenience: build the standard 3-link footer used in emails and
 * the invoice print layout.
 *
 * Returns the three anchor tags with `href`s that combine
 * `company_website` with the appropriate path.
 */
export function buildLegalFooterLinks(branding: BrandingRow): {
  refund_policy: string
  website: string
  terms: string
} {
  const base = branding.company_website.replace(/\/+$/, "")
  return {
    refund_policy: `${base}/return-refund-policy-service-based-only/`,
    website: `${base}/`,
    terms: `${base}/terms-and-conditions/`,
  }
}
