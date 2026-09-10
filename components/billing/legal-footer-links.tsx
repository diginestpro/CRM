"use client"

/**
 * Reusable footer that renders Refund Policy / Website / Terms & Conditions
 * links. The hrefs come from `lib/branding.buildLegalFooterLinks`, which
 * uses `app_settings.company_website` if set, falling back to
 * "https://diginest.pro" and appending the standard path segments:
 *
 *   {base}/return-refund-policy-service-based-only/
 *   {base}/
 *   {base}/terms-and-conditions/
 *
 * Pass a `branding` object (the one returned by `resolveBranding()`) and
 * the same call returns the three URLs.
 */

import { buildLegalFooterLinks } from "@/lib/branding"

interface LegalFooterLinksProps {
  branding: {
    brand_name: string
    company_website: string
  } | null | undefined
  /** Optional CSS class on the wrapping <div>. */
  className?: string
  /** Render in light text (default) or "muted" gray. */
  variant?: "default" | "muted" | "white"
  /**
   * Optional override of the three URLs (e.g. for tests or older
   * invoices that were dumped before footer_links existed).
   */
  overrides?: {
    refund_policy?: string
    website?: string
    terms?: string
  } | null
}

export function LegalFooterLinks({
  branding,
  className,
  variant = "muted",
  overrides,
}: LegalFooterLinksProps) {
  const safe: any = branding || {}
  const links = overrides || (branding ? buildLegalFooterLinks({
    brand_name: safe.brand_name || "DigiNest Solutions",
    company_website: safe.company_website || "https://diginest.pro",
    footer_text: null,
    copyright_year: String(new Date().getFullYear()),
    is_overridden: false,
  } as any) : {
    refund_policy: "https://diginest.pro/return-refund-policy-service-based-only/",
    website: "https://diginest.pro/",
    terms: "https://diginest.pro/terms-and-conditions/",
  })

  const color =
    variant === "white" ? "text-white" :
    variant === "default" ? "text-slate-700" :
    "text-slate-400"
  const linkCls = `underline hover:opacity-80 ${color}`
  const sep    = variant === "white" ? <span className="opacity-60 mx-1">·</span>
                                     : <span className="mx-1">·</span>

  return (
    <div className={className || `${color} text-xs text-center space-y-1`}>
      <p>
        <a href={links.refund_policy} className={linkCls} target="_blank" rel="noopener noreferrer">Refund Policy</a>
        {sep}
        <a href={links.website} className={linkCls} target="_blank" rel="noopener noreferrer">{(branding as any)?.brand_name || "Website"}</a>
        {sep}
        <a href={links.terms} className={linkCls} target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a>
      </p>
    </div>
  )
}
