/**
 * Server-side variant of LegalFooterLinks for use in print layouts and
 * server components. Renders the same three links (Refund Policy /
 * Website / Terms & Conditions) but with a plain HTMLAnchorElement
 * (no client JS).
 */

import { buildLegalFooterLinks } from "@/lib/branding"

interface LegalFooterLinksServerProps {
  branding: {
    brand_name: string
    company_website: string
  } | null | undefined
  overrides?: {
    refund_policy?: string
    website?: string
    terms?: string
  } | null
  /** Tailwind classes for the wrapping <div>. */
  className?: string
}

export function LegalFooterLinksServer({
  branding,
  overrides,
  className,
}: LegalFooterLinksServerProps) {
  const links = overrides || (branding ? buildLegalFooterLinks({
    brand_name: branding.brand_name || "DigiNest Solutions",
    company_website: branding.company_website || "https://diginest.pro",
    footer_text: null,
    copyright_year: String(new Date().getFullYear()),
    is_overridden: false,
  } as any) : {
    refund_policy: "https://diginest.pro/return-refund-policy-service-based-only/",
    website: "https://diginest.pro/",
    terms: "https://diginest.pro/terms-and-conditions/",
  })

  const wrap = className || "pt-12 text-center text-slate-400 text-sm space-y-1"

  return (
    <div className={wrap}>
      <p>
        <a href={links.refund_policy} className="underline hover:text-slate-600" target="_blank" rel="noopener noreferrer">Refund Policy</a>
        {" · "}
        <a href={links.website} className="underline hover:text-slate-600" target="_blank" rel="noopener noreferrer">{(branding as any)?.brand_name || "Website"}</a>
        {" · "}
        <a href={links.terms} className="underline hover:text-slate-600" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a>
      </p>
    </div>
  )
}
