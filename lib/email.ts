import nodemailer from "nodemailer"
import { createClientAdmin } from "./supabase/client"
import { getAppSettings } from "./payment-gateways"
import { loadFromBlock, resolveFromBlock } from "./company-address"
import { resolveBranding, buildLegalFooterLinks } from "./branding"

interface CompanyBranding {
  name: string
  logo_url?: string
  email?: string
  phone?: string
  website?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  country?: string
  tagline?: string
  brand_color?: string
  footer_text?: string
  // Resolved branding block (brand_name + website + copyright year).
  // Populated by lib/email.ts senders from companies + app_settings.
  branding?: {
    brand_name: string
    company_website: string
    footer_text: string | null
    copyright_year: string
    is_overridden: boolean
  }
  // Pre-computed legal-footer URLs (refund / website / terms).
  footer_links?: {
    refund_policy: string
    website: string
    terms: string
  }
}

interface SmtpSettings {
  host: string
  port: number
  username: string | null
  password: string | null
  encryption: string
  from_name: string | null
  from_email: string
}

interface InvoiceLite {
  id: string
  invoice_number: string
  issue_date: string
  due_date: string | null
  subtotal: number
  tax_amount: number
  tax_rate: number
  total_amount: number
  amount_paid: number
  status: string
  notes?: string | null
  currency_code?: string
  selected_address_id?: string | null
  // Multi-office support: which company office (USA / PK / UAE / ...)
  // should appear in the "From" block of THIS invoice?
  company_id?: string | null
  company_address_id?: string | null
}

async function getSmtpSettings(companyId: string): Promise<SmtpSettings | null> {
  try {
    const supabase = createClientAdmin()
    const { data } = await supabase
      .from("smtp_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle()
    if (!data) return null
    return {
      host: data.host,
      port: data.port || 587,
      username: data.username,
      password: data.password,
      encryption: data.encryption || "tls",
      from_name: data.from_name,
      from_email: data.from_email,
    }
  } catch (e) {
    console.error("[getSmtpSettings] error:", e)
    return null
  }
}

async function getCompanyBranding(companyId: string): Promise<CompanyBranding | null> {
  try {
    const supabase = createClientAdmin()
    const { data } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .maybeSingle()
    return data
  } catch (e) {
    console.error("[getCompanyBranding] error:", e)
    return null
  }
}

export function formatMoney(amount: number, currency: string = "USD") {
  const symbols: Record<string, string> = { USD: "$", PKR: "Rs", EUR: "€", GBP: "£" }
  const symbol = symbols[currency] || currency
  return `${symbol} ${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function buildEmailWrapper(company: CompanyBranding, content: string, opts?: { fromBlock?: ReturnType<typeof resolveFromBlock> }) {
  const brandColor = company.brand_color || "#2563eb"
  const logo = company.logo_url
    ? `<img src="${company.logo_url}" alt="${company.name}" style="max-height: 60px; max-width: 200px;" />`
    : `<div style="display:inline-block;width:50px;height:50px;background:${brandColor};border-radius:10px;color:white;font-weight:bold;font-size:24px;line-height:50px;text-align:center;">${company.name.charAt(0).toUpperCase()}</div>`

  // Prefer the explicitly resolved "from_block" (chosen office address).
  // Fall back to the legacy companies.address columns for any caller that
  // hasn't migrated yet.
  const fromBlock = opts?.fromBlock || resolveFromBlock({ company: company as any, address: null })
  const addressHtml = fromBlock.address_html
  const contactLine = [
    fromBlock.email ? `<a href="mailto:${fromBlock.email}" style="color:#64748b;text-decoration:none;">${fromBlock.email}</a>` : "",
    fromBlock.phone ? `<span>${fromBlock.phone}</span>` : "",
  ].filter(Boolean).join(" &nbsp;·&nbsp; ")

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Email</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="padding:24px 32px;border-bottom:1px solid #e2e8f0;">
      <table style="width:100%;"><tr>
        <td style="vertical-align:middle;">${logo}</td>
        <td style="vertical-align:middle;text-align:right;">
          <div style="font-size:16px;font-weight:700;color:${brandColor};">${company.branding?.brand_name || company.name}</div>
          ${company.tagline ? `<div style="font-size:12px;color:#64748b;font-style:italic;">${company.tagline}</div>` : ""}
          ${fromBlock.address_name ? `<div style="font-size:11px;color:#2563eb;font-weight:600;margin-top:4px;">${fromBlock.address_name}</div>` : ""}
          ${addressHtml ? `<div style="font-size:12px;color:#64748b;line-height:1.5;margin-top:4px;">${addressHtml}</div>` : ""}
          ${contactLine ? `<div style="font-size:12px;color:#64748b;margin-top:4px;">${contactLine}</div>` : ""}
        </td>
      </tr></table>
    </div>
    <div style="padding:32px;">${content}</div>
    <div style="padding:16px 32px;background:#f1f5f9;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;text-align:center;">
      ${company.footer_text ? `<div style="margin-bottom:8px;">${company.footer_text}</div>` : ""}
      <div style="margin-bottom:6px;">
        <a href="${company.footer_links?.refund_policy || company.branding?.company_website + "/return-refund-policy-service-based-only/"}" style="color:#64748b;text-decoration:underline;">Refund Policy</a>
        &nbsp;&middot;&nbsp;
        <a href="${company.footer_links?.website || company.branding?.company_website + "/"}" style="color:#64748b;text-decoration:underline;">${company.branding?.brand_name || company.name}</a>
        &nbsp;&middot;&nbsp;
        <a href="${company.footer_links?.terms || company.branding?.company_website + "/terms-and-conditions/"}" style="color:#64748b;text-decoration:underline;">Terms &amp; Conditions</a>
      </div>
      <div>&copy; ${company.branding?.copyright_year || new Date().getFullYear()} ${company.branding?.brand_name || company.name}</div>
    </div>
  </div>
</body>
</html>`
}


export interface SendEmailResult {
  ok: boolean
  error?: string
  messageId?: string
  /** Set by enqueueEmail when scheduled_for is set: the row stayed
   *  in 'pending' state and the SMTP send was deferred. */
  queued?: boolean
  /** Set by enqueueEmail / sendQueueRow: the email_queue.id row that
   *  was inserted / re-sent. Useful for the admin queue UI. */
  queueId?: string
}

async function getAppUrl(companyId?: string): Promise<string> {
  let appUrl = process.env.NEXT_PUBLIC_APP_URL || ""

  try {
    const settings = await getAppSettings(companyId)
    if (settings?.app_url) {
      appUrl = settings.app_url
    }
  } catch (e) {
    console.error("[getAppUrl] Error fetching settings:", e)
  }

  // Normalize: ensure the URL starts with https:// (or http:// for local dev)
  if (appUrl && !/^https?:\/\//i.test(appUrl)) {
    appUrl = "https://" + appUrl.replace(/^\/+/, "")
  }
  // Strip trailing slash
  if (appUrl) {
    appUrl = appUrl.replace(/\/+$/, "")
  }

  return appUrl
}

export async function sendEmail(companyId: string, to: string, subject: string, html: string, text: string, opts: { relatedType?: string; relatedId?: string } = {}): Promise<SendEmailResult> {
  const smtp = await getSmtpSettings(companyId)
  if (!smtp || !smtp.host || !smtp.from_email) {
    return { ok: false, error: "SMTP not configured for this company" }
  }

  try {
    const encryption = String(smtp.encryption || "tls").toLowerCase()
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: encryption === "ssl",
      auth: smtp.username ? { user: smtp.username, pass: smtp.password || "" } : undefined,
      tls: { rejectUnauthorized: false },
      connectionTimeout: 15000,
    })

    const info = await transporter.sendMail({
      from: `"${smtp.from_name || process.env.NEXT_PUBLIC_BRAND_NAME || "DigiNest Solutions"}" <${smtp.from_email}>`,
      to,
      subject,
      text,
      html,
    })

    try {
      const supabase = createClientAdmin()
      await supabase.from("email_log").insert({
        company_id: companyId,
        to_email: to,
        from_email: smtp.from_email,
        subject,
        body: text.slice(0, 1000),
        template: opts.relatedType || "general",
        related_type: opts.relatedType,
        related_id: opts.relatedId,
        status: "sent",
      })
    } catch (e) {
      console.error("[sendEmail] log error:", e)
    }

    return { ok: true, messageId: info.messageId }
  } catch (e: any) {
    console.error("[sendEmail] error:", e)
    try {
      const supabase = createClientAdmin()
      await supabase.from("email_log").insert({
        company_id: companyId,
        to_email: to,
        from_email: smtp.from_email,
        subject,
        template: opts.relatedType,
        related_type: opts.relatedType,
        related_id: opts.relatedId,
        status: "failed",
        error: String(e.message || e).slice(0, 500),
      })
    } catch {}
    return { ok: false, error: e.message || "SMTP send failed" }
  }
}


export async function sendInvoiceEmail(companyId: string, invoiceId: string): Promise<SendEmailResult> {
  const supabase = createClientAdmin()

  const [invoiceResult, itemsResult, companyResult, appSettingsResult] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle(),
    supabase.from("invoice_items").select("*, services(name)").eq("invoice_id", invoiceId),
    supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
    supabase.from("app_settings").select("*").eq("company_id", companyId).maybeSingle(),
  ])

  const invoice = invoiceResult.data as InvoiceLite | null
  const items = itemsResult.data || []
  const company = companyResult.data as CompanyBranding | null
  const appSettings = (appSettingsResult.data as any) || null
  // Attach resolved branding + footer links so the wrapper renders the
  // correct brand name + URLs without hard-coding.
  if (company) {
    company.branding = resolveBranding({
      company: { name: company.name },
      appSettings: { brand_name: appSettings?.brand_name, company_website: appSettings?.company_website },
      footerText: company.footer_text ?? null,
    })
    company.footer_links = buildLegalFooterLinks(company.branding)
  }

  if (!invoice) return { ok: false, error: "Invoice not found" }
  if (!company) return { ok: false, error: "Company not found" }

  let client: any = null
  if (invoiceResult.data?.client_id) {
    const { data } = await supabase.from("clients").select("*").eq("id", invoiceResult.data.client_id).maybeSingle()
    client = data
  }

  if (!client?.email) {
    return { ok: false, error: "Client has no email address" }
  }

  const currency = invoice.currency_code || "USD"
  const appUrl = await getAppUrl(companyId)
  const payLink = `${appUrl}/pay/${invoice.id}`

  // Resolve the chosen address for this invoice (multi-address support).
  let billingAddressBlock = ""
  if (invoice.selected_address_id) {
    const { data: addr } = await supabase
      .from("client_addresses")
      .select("*")
      .eq("id", invoice.selected_address_id)
      .maybeSingle()
    if (addr) {
      const addrLines: string[] = []
      if (addr.label) addrLines.push(`<div style="font-weight:600;color:#0f172a;">${addr.label}</div>`)
      if (addr.street) addrLines.push(`<div>${addr.street}</div>`)
      const cityLine = [addr.city, addr.state, addr.postal_code].filter(Boolean).join(", ")
      if (cityLine) addrLines.push(`<div>${cityLine}</div>`)
      if (addr.country) addrLines.push(`<div>${addr.country}</div>`)
      billingAddressBlock = `
        <div style="margin:16px 0;padding:12px 14px;background:#f1f5f9;border-radius:6px;font-size:13px;color:#475569;">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#94a3b8;letter-spacing:0.05em;margin-bottom:4px;">Billing Address</div>
          ${addrLines.join("")}
        </div>
      `
    }
  }

  const statusColors: Record<string, string> = {
    Draft: "#64748b", Unpaid: "#f59e0b", Partial: "#3b82f6",
    Paid: "#10b981", Overdue: "#ef4444", Cancelled: "#6b7280",
  }
  const statusColor = statusColors[invoice.status] || "#64748b"

  const itemsHtml = items.map((it: any) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-size:13px;">${it.description || it.services?.name || "Item"}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:center;">${it.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:right;">${formatMoney(it.unit_price, currency)}</td>
      <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-size:13px;text-align:right;font-weight:500;">${formatMoney(it.unit_price * it.quantity, currency)}</td>
    </tr>
  `).join("")

  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;">Invoice ${invoice.invoice_number}</h2>
    <p style="margin:0 0 16px;color:#64748b;font-size:14px;">Hi ${client.full_name || "there"},</p>
    <p style="font-size:14px;line-height:1.6;">${company.name} has sent you an invoice. Please review the details below.</p>

    <table style="width:100%;margin:16px 0;font-size:13px;">
      <tr><td style="padding:4px;color:#64748b;">Invoice Number</td><td style="padding:4px;text-align:right;font-weight:500;">${invoice.invoice_number}</td></tr>
      <tr><td style="padding:4px;color:#64748b;">Issue Date</td><td style="padding:4px;text-align:right;">${invoice.issue_date}</td></tr>
      <tr><td style="padding:4px;color:#64748b;">Due Date</td><td style="padding:4px;text-align:right;">${invoice.due_date || "Upon receipt"}</td></tr>
      <tr><td style="padding:4px;color:#64748b;">Status</td><td style="padding:4px;text-align:right;"><span style="background:${statusColor}22;color:${statusColor};padding:2px 8px;border-radius:4px;font-weight:600;font-size:12px;">${invoice.status}</span></td></tr>
    </table>

    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:8px;text-align:left;font-size:12px;color:#64748b;">Description</th>
          <th style="padding:8px;text-align:center;font-size:12px;color:#64748b;">Qty</th>
          <th style="padding:8px;text-align:right;font-size:12px;color:#64748b;">Unit Price</th>
          <th style="padding:8px;text-align:right;font-size:12px;color:#64748b;">Total</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <table style="width:100%;margin-top:16px;">
      <tr><td style="text-align:right;padding:4px;color:#64748b;">Subtotal</td><td style="text-align:right;padding:4px;width:120px;">${formatMoney(invoice.subtotal || 0, currency)}</td></tr>
      ${(invoice.tax_amount || 0) > 0 ? `<tr><td style="text-align:right;padding:4px;color:#64748b;">Tax (${invoice.tax_rate || 0}%)</td><td style="text-align:right;padding:4px;">${formatMoney(invoice.tax_amount, currency)}</td></tr>` : ""}
      <tr><td style="text-align:right;padding:8px 4px;font-weight:700;font-size:16px;border-top:1px solid #e2e8f0;">Total</td><td style="text-align:right;padding:8px 4px;font-weight:700;font-size:16px;border-top:1px solid #e2e8f0;">${formatMoney(invoice.total_amount, currency)}</td></tr>
    </table>

    ${billingAddressBlock}
    ${invoice.status !== "Paid" && invoice.status !== "Cancelled" ? `
    <div style="text-align:center;margin:24px 0;">
      <a href="${payLink}" style="display:inline-block;background:${company.brand_color || "#2563eb"};color:white;padding:12px 32px;text-decoration:none;border-radius:6px;font-weight:600;">View &amp; Pay Invoice</a>
    </div>
    ` : ""}

    ${invoice.notes ? `<p style="font-size:13px;color:#64748b;padding:12px;background:#f8fafc;border-radius:4px;">${invoice.notes}</p>` : ""}

    <p style="font-size:12px;color:#64748b;margin-top:24px;">If you have any questions, please reply to this email.</p>
  `

  // Resolve the chosen office address (USA / PK / UAE / ...) so the email
  // shows the picked office in the From block, not always the legacy
  // companies.address columns.
  const fromBlock = await loadFromBlock(supabase, invoice)

  const html = buildEmailWrapper(company, content, { fromBlock })
  const text = `Invoice ${invoice.invoice_number}
Amount: ${formatMoney(invoice.total_amount, currency)}
Due: ${invoice.due_date || "Upon receipt"}
Pay: ${payLink}`

  // The `from_email` we store in email_queue is the ACTUAL SMTP
  // envelope sender (smtp_settings.from_email), not the company's
  // general contact email. We populate it here from `getSmtpSettings`
  // so the Email Queue UI shows the real sender that recipients see
  // in their inbox. If SMTP is not configured we fall back to the
  // company contact address (purely a display fallback; SMTP send
  // will fail and the row will be marked 'failed' with a clear
  // "SMTP not configured" last_error).
  const invSmtp = await getSmtpSettings(companyId)

  return enqueueEmail({
    company_id: companyId,
    to_email: client.email,
    from_email: invSmtp?.from_email || company?.email,
    subject: `Invoice ${invoice.invoice_number} from ${company.name}`,
    body_html: html,
    body_text: text,
    template: "invoice",
    related_type: "invoice",
    related_id: invoice.id,
  })
}


export async function sendReceiptEmail(companyId: string, invoiceId: string): Promise<SendEmailResult> {
  const supabase = createClientAdmin()
  const [{ data: invoice }, { data: company }, { data: appSettings }] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle(),
    supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
    supabase.from("app_settings").select("*").eq("company_id", companyId).maybeSingle(),
  ])

  if (!invoice) return { ok: false, error: "Invoice not found" }
  if (!company) return { ok: false, error: "Company not found" }
  company.branding = resolveBranding({
    company: { name: company.name },
    appSettings: { brand_name: appSettings?.brand_name, company_website: appSettings?.company_website },
    footerText: company.footer_text ?? null,
  })
  company.footer_links = buildLegalFooterLinks(company.branding)

  let client: any = null
  if (invoice.client_id) {
    const { data } = await supabase.from("clients").select("*").eq("id", invoice.client_id).maybeSingle()
    client = data
  }
  if (!client?.email) return { ok: false, error: "Client has no email address" }

  const currency = invoice.currency_code || "USD"
  const balance = Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0))
  const appUrl = await getAppUrl(companyId)
  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#10b981;">Payment Received</h2>
    <p style="margin:0 0 16px;color:#64748b;font-size:14px;">Hi ${client.full_name || "there"},</p>
    <p style="font-size:14px;line-height:1.6;">Thank you for your payment of <strong>${formatMoney(invoice.amount_paid, currency)}</strong> on invoice <strong>${invoice.invoice_number}</strong>.</p>
    ${balance > 0 ? `<p style="font-size:14px;line-height:1.6;color:#f59e0b;">Your remaining balance is <strong>${formatMoney(balance, currency)}</strong>.</p>` : `<p style="font-size:14px;line-height:1.6;color:#10b981;">Your invoice is now paid in full.</p>`}
    <div style="text-align:center;margin:24px 0;">
      <a href="${appUrl}/pay/${invoice.id}/receipt" style="display:inline-block;background:#10b981;color:white;padding:12px 32px;text-decoration:none;border-radius:6px;font-weight:600;">View Receipt</a>
    </div>
  `
  // Resolve the chosen office address (so receipt uses the same From
  // block the client saw when they paid).
  const fromBlock = await loadFromBlock(supabase, invoice)

  const html = buildEmailWrapper(company, content, { fromBlock })
  // See sendInvoiceEmail — use the SMTP envelope sender (smtp_settings.from_email)
  // as the queue's `from_email` so the admin Email Queue UI shows the real sender.
  const recSmtp = await getSmtpSettings(companyId)

  return enqueueEmail({
    company_id: companyId,
    to_email: client.email,
    from_email: recSmtp?.from_email || company?.email,
    subject: `Payment received - ${invoice.invoice_number}`,
    body_html: html,
    body_text: `Payment of ${formatMoney(invoice.amount_paid, currency)} received for invoice ${invoice.invoice_number}.`,
    template: "receipt",
    related_type: "payment",
    related_id: invoice.id,
  })
}

export async function sendOverdueReminder(companyId: string, invoiceId: string): Promise<SendEmailResult> {
  const supabase = createClientAdmin()
  const [{ data: invoice }, { data: company }, { data: appSettings }] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle(),
    supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
    supabase.from("app_settings").select("*").eq("company_id", companyId).maybeSingle(),
  ])

  if (!invoice) return { ok: false, error: "Invoice not found" }
  if (!company) return { ok: false, error: "Company not found" }
  company.branding = resolveBranding({
    company: { name: company.name },
    appSettings: { brand_name: appSettings?.brand_name, company_website: appSettings?.company_website },
    footerText: company.footer_text ?? null,
  })
  company.footer_links = buildLegalFooterLinks(company.branding)

  let client: any = null
  if (invoice.client_id) {
    const { data } = await supabase.from("clients").select("*").eq("id", invoice.client_id).maybeSingle()
    client = data
  }
  if (!client?.email) return { ok: false, error: "Client has no email address" }

  const currency = invoice.currency_code || "USD"
  const balance = Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0))
  const appUrl = await getAppUrl(companyId)
  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#ef4444;">Invoice Overdue</h2>
    <p style="font-size:14px;">Invoice <strong>${invoice.invoice_number}</strong> was due on <strong>${invoice.due_date}</strong> and has not been paid.</p>
    <p style="font-size:14px;">Outstanding balance: <strong>${formatMoney(balance, currency)}</strong></p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${appUrl}/pay/${invoice.id}" style="display:inline-block;background:#ef4444;color:white;padding:12px 32px;text-decoration:none;border-radius:6px;font-weight:600;">Pay Now</a>
    </div>
  `
  // Resolve the chosen office address.
  const fromBlock = await loadFromBlock(supabase, invoice)

  const html = buildEmailWrapper(company, content, { fromBlock })
  // See sendInvoiceEmail — use the SMTP envelope sender (smtp_settings.from_email)
  // as the queue's `from_email` so the admin Email Queue UI shows the real sender.
  const odSmtp = await getSmtpSettings(companyId)

  return enqueueEmail({
    company_id: companyId,
    to_email: client.email,
    from_email: odSmtp?.from_email || company?.email,
    subject: `Overdue: Invoice ${invoice.invoice_number}`,
    body_html: html,
    body_text: `Invoice ${invoice.invoice_number} is overdue. Outstanding: ${formatMoney(balance, currency)}.`,
    template: "overdue",
    related_type: "overdue",
    related_id: invoice.id,
  })
}

// ============================================================
// Email queue
//
// Every transactional email is first recorded in
// public.email_queue with status='pending', then the SMTP send is
// attempted. The /admin/emails UI lets users inspect the queue,
// manually send any pending/failed row, and see what already went
// out.
// ============================================================

export interface EnqueueEmailArgs {
  company_id: string
  to_email: string
  from_email?: string
  subject: string
  body_html: string
  body_text: string
  template?: string
  related_type?: string | null
  related_id?: string | null
  /** When set, the row stays 'pending' until this time (UTC). */
  scheduled_for?: string | null
}

/**
 * Queue and immediately attempt to send an email.
 *
 * Side effects:
 *   1. Inserts a row into email_queue with status='pending'
 *   2. Sets status='sending' and tries the SMTP send
 *   3. Sets status='sent' (and sent_at) on success, 'failed' (and last_error) on failure
 *   4. Increments attempts on every send attempt
 *
 * Returns the same shape as sendEmail so existing callers don't
 * need to change.
 */
export async function enqueueEmail(args: EnqueueEmailArgs): Promise<SendEmailResult> {
  const supabase = createClientAdmin()

  const { data: row, error: insertErr } = await supabase
    .from("email_queue")
    .insert({
      company_id: args.company_id,
      to_email: args.to_email,
      from_email: args.from_email || null,
      subject: args.subject,
      body_html: args.body_html,
      body_text: args.body_text,
      template: args.template || "general",
      related_type: args.related_type || null,
      related_id: args.related_id || null,
      status: "pending",
      attempts: 0,
      scheduled_for: args.scheduled_for || null,
    })
    .select("id")
    .single()

  if (insertErr || !row) {
    console.error("[enqueueEmail] INSERT failed:", insertErr?.message, insertErr)
    return { ok: false, error: insertErr?.message || "Failed to enqueue email" }
  }

  console.log("[enqueueEmail] queued", { queueId: row.id, to: args.to_email, subject: args.subject })

  if (!args.scheduled_for) {
    return await sendQueueRow(row.id)
  }
  return { ok: true, queued: true, queueId: row.id }
}

/**
 * Attempt to send a queue row by id. Marks it 'sending', runs SMTP,
 * then 'sent' or 'failed'. Always increments `attempts`.
 *
 * Exposed so the admin UI can re-send pending / failed rows.
 */
export async function sendQueueRow(queueId: string): Promise<SendEmailResult> {
  const supabase = createClientAdmin()

  const { data: row, error: loadErr } = await supabase
    .from("email_queue")
    .select("*")
    .eq("id", queueId)
    .maybeSingle()

  if (loadErr || !row) {
    return { ok: false, error: loadErr?.message || "Queue row not found" }
  }

  if (row.status === "sent") {
    return { ok: false, error: "Email already sent" }
  }

  await supabase
    .from("email_queue")
    .update({
      status: "sending",
      attempts: (row.attempts || 0) + 1,
      last_error: null,
    })
    .eq("id", queueId)

  const smtp = await getSmtpSettings(row.company_id)
  if (!smtp || !smtp.host || !smtp.from_email) {
    const msg = "SMTP not configured for this company"
    await supabase
      .from("email_queue")
      .update({ status: "failed", last_error: msg })
      .eq("id", queueId)
    return { ok: false, error: msg }
  }

  try {
    const encryption = String(smtp.encryption || "tls").toLowerCase()
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: encryption === "ssl",
      auth: smtp.username ? { user: smtp.username, pass: smtp.password || "" } : undefined,
      tls: { rejectUnauthorized: false },
      connectionTimeout: 15000,
    })
    const info = await transporter.sendMail({
      from: `"${smtp.from_name || "DigiNest Solutions"}" <${smtp.from_email}>`,
      to: row.to_email,
      subject: row.subject,
      text: row.body_text,
      html: row.body_html,
    })

    await Promise.all([
      supabase
        .from("email_queue")
        .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
        .eq("id", queueId),
      supabase.from("email_log").insert({
        company_id: row.company_id,
        to_email: row.to_email,
        from_email: smtp.from_email,
        subject: row.subject,
        body: (row.body_text || "").slice(0, 1000),
        template: row.template || null,
        related_type: row.related_type || null,
        related_id: row.related_id || null,
        status: "sent",
      }),
    ])

    return { ok: true, messageId: info.messageId, queueId }
  } catch (e: any) {
    const msg = String(e.message || e).slice(0, 500)
    await supabase
      .from("email_queue")
      .update({ status: "failed", last_error: msg })
      .eq("id", queueId)
    try {
      await supabase.from("email_log").insert({
        company_id: row.company_id,
        to_email: row.to_email,
        from_email: smtp.from_email,
        subject: row.subject,
        template: row.template || null,
        related_type: row.related_type || null,
        related_id: row.related_id || null,
        status: "failed",
        error: msg,
      })
    } catch {}
    return { ok: false, error: msg }
  }
}
