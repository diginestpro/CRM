import nodemailer from "nodemailer"
import { createClientServer } from "@/lib/supabase/server"

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
  smtp_host: string
  smtp_port: string
  smtp_user: string
  smtp_password: string
  smtp_from_email: string
  smtp_from_name: string
  smtp_secure: string
}

async function getSmtpSettings(companyId: string): Promise<SmtpSettings | null> {
  try {
    const supabase = await createClientServer()
    const { data } = await supabase
      .from("company_settings")
      .select("*")
      .eq("company_id", companyId)
      .eq("setting_key", "smtp")
      .maybeSingle()

    if (data?.setting_value) {
      return JSON.parse(data.setting_value)
    }
  } catch (e) {
    console.error("[getSmtpSettings] error:", e)
  }
  return null
}

async function getCompanyBranding(companyId: string): Promise<CompanyBranding | null> {
  try {
    const supabase = await createClientServer()
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

function formatMoney(amount: number, currency: string = "USD") {
  const symbols: Record<string, string> = { USD: "$", PKR: "Rs", EUR: "€", GBP: "£" }
  const symbol = symbols[currency] || currency
  return `${symbol} ${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function buildEmailWrapper(company: CompanyBranding, content: string) {
  const brandColor = company.brand_color || "#2563eb"
  const logo = company.logo_url
    ? `<img src="${company.logo_url}" alt="${company.name}" style="max-height: 60px; max-width: 200px;" />`
    : `<div style="display: inline-block; width: 50px; height: 50px; background: ${brandColor}; border-radius: 10px; color: white; font-weight: bold; font-size: 24px; line-height: 50px; text-align: center;">${company.name.charAt(0).toUpperCase()}</div>`

  const address = [company.address, company.city, company.state, company.zip, company.country].filter(Boolean).join(", ")

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f1f5f9;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f1f5f9; padding: 32px 16px;">
<tr>
<td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
<tr>
<td style="padding: 32px; text-align: center; border-bottom: 1px solid #e2e8f0;">
  ${logo}
  <h1 style="margin: 16px 0 4px 0; font-size: 20px; color: #0f172a;">${company.name}</h1>
  ${company.tagline ? `<p style="margin: 0; font-size: 14px; color: #64748b;">${company.tagline}</p>` : ""}
</td>
</tr>
<tr>
<td style="padding: 32px;">
  ${content}
</td>
</tr>
<tr>
<td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">
  ${company.footer_text || "Thank you for your business."}
  ${address ? `<br/><span style="color: #94a3b8;">${address}</span>` : ""}
  ${company.phone || company.email ? `<br/><span style="color: #94a3b8;">${[company.phone, company.email].filter(Boolean).join(" | ")}</span>` : ""}
  ${company.website ? `<br/><a href="${company.website}" style="color: ${brandColor}; text-decoration: none;">${company.website}</a>` : ""}
  <br/><br/><span style="color: #cbd5e1;">Powered by NexusCRM</span>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
`
}

export async function sendEmail(companyId: string, to: string, subject: string, html: string, text?: string) {
  const smtp = await getSmtpSettings(companyId)
  if (!smtp || !smtp.smtp_host) {
    console.log("[sendEmail] No SMTP configured, skipping email to:", to)
    return { success: false, reason: "SMTP not configured" }
  }

  try {
    const port = parseInt(smtp.smtp_port || "587", 10)
    const secure = smtp.smtp_secure === "ssl"

    const transporter = nodemailer.createTransport({
      host: smtp.smtp_host,
      port: port,
      secure: secure,
      auth: smtp.smtp_user ? { user: smtp.smtp_user, pass: smtp.smtp_password } : undefined,
      tls: smtp.smtp_secure === "tls" ? { rejectUnauthorized: false } : undefined,
    })

    await transporter.sendMail({
      from: `"${smtp.smtp_from_name || "NexusCRM"}" <${smtp.smtp_from_email}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ""),
    })
    return { success: true }
  } catch (e: any) {
    console.error("[sendEmail] error:", e)
    return { success: false, reason: e.message }
  }
}

export async function sendInvoiceEmail(companyId: string, to: string, invoice: any, clientName: string, invoiceUrl: string) {
  const company = await getCompanyBranding(companyId)
  if (!company) return { success: false, reason: "Company not found" }

  const brandColor = company.brand_color || "#2563eb"
  const remaining = (invoice.total_amount || 0) - (invoice.amount_paid || 0)
  const currency = invoice.currency_code || "USD"

  const itemsHtml = (invoice.invoice_items || [])
    .map(
      (item: any) => `
<tr>
  <td style="padding: 12px 8px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #0f172a;">
    ${item.description || item.services?.name || "Service"}
  </td>
  <td style="padding: 12px 8px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #64748b; text-align: center;">
    ${item.quantity}
  </td>
  <td style="padding: 12px 8px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #64748b; text-align: right;">
    ${formatMoney(item.unit_price, currency)}
  </td>
  <td style="padding: 12px 8px; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #0f172a; text-align: right; font-weight: 600;">
    ${formatMoney(item.total_amount, currency)}
  </td>
</tr>`
    )
    .join("")

  const content = `
<h2 style="margin: 0 0 8px 0; font-size: 22px; color: #0f172a;">Invoice ${invoice.invoice_number}</h2>
<p style="margin: 0 0 24px 0; font-size: 14px; color: #64748b;">Hi ${clientName},</p>
<p style="margin: 0 0 24px 0; font-size: 14px; color: #475569; line-height: 1.6;">
  ${invoice.status === "Paid" ? "Thank you for your payment. This invoice has been paid in full." : "Please find your invoice details below. Click the button to view and pay online."}
</p>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
<tr>
  <td style="padding: 4px 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Invoice Number</td>
  <td style="padding: 4px 0; font-size: 14px; color: #0f172a; font-weight: 600; text-align: right;">${invoice.invoice_number}</td>
</tr>
<tr>
  <td style="padding: 4px 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Date Issued</td>
  <td style="padding: 4px 0; font-size: 14px; color: #0f172a; text-align: right;">${new Date(invoice.issue_date || invoice.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</td>
</tr>
${invoice.due_date ? `
<tr>
  <td style="padding: 4px 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Due Date</td>
  <td style="padding: 4px 0; font-size: 14px; color: #0f172a; text-align: right;">${new Date(invoice.due_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</td>
</tr>` : ""}
<tr>
  <td style="padding: 4px 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Amount Due</td>
  <td style="padding: 4px 0; font-size: 20px; color: ${brandColor}; font-weight: 700; text-align: right;">${formatMoney(remaining, currency)}</td>
</tr>
</table>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
<tr style="background-color: #f1f5f9;">
  <th style="padding: 8px; font-size: 12px; color: #64748b; text-align: left; text-transform: uppercase; letter-spacing: 0.5px;">Description</th>
  <th style="padding: 8px; font-size: 12px; color: #64748b; text-align: center; text-transform: uppercase; letter-spacing: 0.5px;">Qty</th>
  <th style="padding: 8px; font-size: 12px; color: #64748b; text-align: right; text-transform: uppercase; letter-spacing: 0.5px;">Price</th>
  <th style="padding: 8px; font-size: 12px; color: #64748b; text-align: right; text-transform: uppercase; letter-spacing: 0.5px;">Total</th>
</tr>
${itemsHtml}
</table>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
  <td align="center" style="padding: 8px 0;">
    <a href="${invoiceUrl}" style="display: inline-block; background-color: ${brandColor}; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
      ${invoice.status === "Paid" ? "View Invoice" : "View & Pay Invoice"}
    </a>
  </td>
</tr>
</table>

<p style="margin: 24px 0 0 0; font-size: 13px; color: #94a3b8; text-align: center;">
  Or copy this link: <a href="${invoiceUrl}" style="color: ${brandColor}; word-break: break-all;">${invoiceUrl}</a>
</p>
`

  const html = buildEmailWrapper(company, content)
  const subject = `Invoice ${invoice.invoice_number} from ${company.name}`

  return await sendEmail(companyId, to, subject, html)
}

export async function sendPaymentConfirmationEmail(companyId: string, to: string, invoice: any, amount: number, clientName: string) {
  const company = await getCompanyBranding(companyId)
  if (!company) return { success: false, reason: "Company not found" }

  const brandColor = company.brand_color || "#2563eb"
  const currency = invoice.currency_code || "USD"

  const content = `
<div style="text-align: center; margin-bottom: 24px;">
  <div style="display: inline-block; width: 64px; height: 64px; background: #d1fae5; border-radius: 50%; line-height: 64px;">
    <span style="font-size: 32px; color: #059669;">&#10003;</span>
  </div>
</div>
<h2 style="margin: 0 0 8px 0; font-size: 22px; color: #0f172a; text-align: center;">Payment Received</h2>
<p style="margin: 0 0 24px 0; font-size: 14px; color: #64748b; text-align: center;">Thank you, ${clientName}!</p>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f0fdf4; border-radius: 8px; padding: 24px; margin-bottom: 24px; border: 1px solid #bbf7d0;">
<tr>
  <td style="padding: 8px 0; font-size: 12px; color: #166534; text-transform: uppercase; letter-spacing: 0.5px;">Invoice</td>
  <td style="padding: 8px 0; font-size: 14px; color: #14532d; text-align: right;">${invoice.invoice_number}</td>
</tr>
<tr>
  <td style="padding: 8px 0; font-size: 12px; color: #166534; text-transform: uppercase; letter-spacing: 0.5px;">Amount Paid</td>
  <td style="padding: 8px 0; font-size: 20px; color: #15803d; text-align: right; font-weight: 700;">${formatMoney(amount, currency)}</td>
</tr>
<tr>
  <td style="padding: 8px 0; font-size: 12px; color: #166534; text-transform: uppercase; letter-spacing: 0.5px;">Date</td>
  <td style="padding: 8px 0; font-size: 14px; color: #14532d; text-align: right;">${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</td>
</tr>
<tr>
  <td style="padding: 8px 0; font-size: 12px; color: #166534; text-transform: uppercase; letter-spacing: 0.5px;">Status</td>
  <td style="padding: 8px 0; font-size: 14px; color: #14532d; text-align: right; font-weight: 600;">${invoice.status}</td>
</tr>
</table>

<p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.6; text-align: center;">
  Your payment has been successfully processed. A receipt has been attached to your invoice.
</p>
`

  const html = buildEmailWrapper(company, content)
  const subject = `Payment received - ${invoice.invoice_number}`

  return await sendEmail(companyId, to, subject, html)
}

export async function sendWelcomeEmail(companyId: string, to: string, fullName: string, tempPassword?: string) {
  const company = await getCompanyBranding(companyId)
  if (!company) return { success: false, reason: "Company not found" }

  const content = `
<h2 style="margin: 0 0 16px 0; font-size: 22px; color: #0f172a;">Welcome to ${company.name}!</h2>
<p style="margin: 0 0 24px 0; font-size: 14px; color: #475569; line-height: 1.6;">
  Hi ${fullName},
</p>
<p style="margin: 0 0 24px 0; font-size: 14px; color: #475569; line-height: 1.6;">
  You have been added as a team member on ${company.name}'s NexusCRM workspace. You can now sign in to manage clients, quotations, and invoices.
</p>
${tempPassword ? `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin-bottom: 24px;">
<tr>
  <td style="font-size: 14px; color: #78350f;">
    <strong>Your temporary password:</strong> <code style="background: #fde68a; padding: 4px 8px; border-radius: 4px;">${tempPassword}</code>
    <br/><span style="font-size: 12px;">Please change this password after signing in.</span>
  </td>
</tr>
</table>
` : ""}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
  <td align="center" style="padding: 16px 0;">
    <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login" style="display: inline-block; background-color: ${company.brand_color || "#2563eb"}; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
      Sign In to Your Workspace
    </a>
  </td>
</tr>
</table>
`

  const html = buildEmailWrapper(company, content)
  const subject = `Welcome to ${company.name}`

  return await sendEmail(companyId, to, subject, html)
}
