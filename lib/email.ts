import nodemailer from "nodemailer"
import { createClientAdmin } from "./supabase/client"
import { getAppSettings } from "./payment-gateways"

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

function buildEmailWrapper(company: CompanyBranding, content: string) {
  const brandColor = company.brand_color || "#2563eb"
  const logo = company.logo_url
    ? `<img src="${company.logo_url}" alt="${company.name}" style="max-height: 60px; max-width: 200px;" />`
    : `<div style="display:inline-block;width:50px;height:50px;background:${brandColor};border-radius:10px;color:white;font-weight:bold;font-size:24px;line-height:50px;text-align:center;">${company.name.charAt(0).toUpperCase()}</div>`

  const address = [company.address, company.city, company.state, company.zip, company.country].filter(Boolean).join(", ")

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
          <div style="font-size:18px;font-weight:700;color:${brandColor};">${company.name}</div>
          ${company.tagline ? `<div style="font-size:12px;color:#64748b;font-style:italic;">${company.tagline}</div>` : ""}
        </td>
      </tr></table>
      ${address ? `<div style="font-size:11px;color:#64748b;margin-top:8px;">${address}</div>` : ""}
    </div>
    <div style="padding:32px;">${content}</div>
    <div style="padding:16px 32px;background:#f1f5f9;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;text-align:center;">
      ${company.footer_text || `Powered by ${company.name}`}
    </div>
  </div>
</body>
</html>`
}


export interface SendEmailResult {
  ok: boolean
  error?: string
  messageId?: string
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

async function sendEmail(companyId: string, to: string, subject: string, html: string, text: string, opts: { relatedType?: string; relatedId?: string } = {}): Promise<SendEmailResult> {
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
      from: `"${smtp.from_name || "NexusCRM"}" <${smtp.from_email}>`,
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

  const [invoiceResult, itemsResult, companyResult] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle(),
    supabase.from("invoice_items").select("*, services(name)").eq("invoice_id", invoiceId),
    supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
  ])

  const invoice = invoiceResult.data as InvoiceLite | null
  const items = itemsResult.data || []
  const company = companyResult.data as CompanyBranding | null

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

    ${invoice.status !== "Paid" && invoice.status !== "Cancelled" ? `
    <div style="text-align:center;margin:24px 0;">
      <a href="${payLink}" style="display:inline-block;background:${company.brand_color || "#2563eb"};color:white;padding:12px 32px;text-decoration:none;border-radius:6px;font-weight:600;">View &amp; Pay Invoice</a>
    </div>
    ` : ""}

    ${invoice.notes ? `<p style="font-size:13px;color:#64748b;padding:12px;background:#f8fafc;border-radius:4px;">${invoice.notes}</p>` : ""}

    <p style="font-size:12px;color:#64748b;margin-top:24px;">If you have any questions, please reply to this email.</p>
  `

  const html = buildEmailWrapper(company, content)
  const text = `Invoice ${invoice.invoice_number}
Amount: ${formatMoney(invoice.total_amount, currency)}
Due: ${invoice.due_date || "Upon receipt"}
Pay: ${payLink}`

  return sendEmail(companyId, client.email, `Invoice ${invoice.invoice_number} from ${company.name}`, html, text, {
    relatedType: "invoice",
    relatedId: invoice.id,
  })
}


export async function sendReceiptEmail(companyId: string, invoiceId: string): Promise<SendEmailResult> {
  const supabase = createClientAdmin()
  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle()
  const { data: company } = await supabase.from("companies").select("*").eq("id", companyId).maybeSingle()

  if (!invoice) return { ok: false, error: "Invoice not found" }
  if (!company) return { ok: false, error: "Company not found" }

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
  const html = buildEmailWrapper(company, content)
  return sendEmail(companyId, client.email, `Payment received - ${invoice.invoice_number}`, html,
    `Payment of ${formatMoney(invoice.amount_paid, currency)} received for invoice ${invoice.invoice_number}.`,
    { relatedType: "payment", relatedId: invoice.id })
}

export async function sendOverdueReminder(companyId: string, invoiceId: string): Promise<SendEmailResult> {
  const supabase = createClientAdmin()
  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle()
  const { data: company } = await supabase.from("companies").select("*").eq("id", companyId).maybeSingle()

  if (!invoice) return { ok: false, error: "Invoice not found" }
  if (!company) return { ok: false, error: "Company not found" }

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
  const html = buildEmailWrapper(company, content)
  return sendEmail(companyId, client.email, `Overdue: Invoice ${invoice.invoice_number}`, html,
    `Invoice ${invoice.invoice_number} is overdue. Outstanding: ${formatMoney(balance, currency)}.`,
    { relatedType: "overdue", relatedId: invoice.id })
}
