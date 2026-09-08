p = r'C:\Users\LENOVO\Desktop\CRM\lib\email.ts'
with open(p, 'rb') as f:
    c = f.read()

part_c = b'''

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
  const appUrl = getAppUrl()
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
  const text = `Invoice ${invoice.invoice_number}\nAmount: ${formatMoney(invoice.total_amount, currency)}\nDue: ${invoice.due_date || "Upon receipt"}\nPay: ${payLink}`

  return sendEmail(companyId, client.email, `Invoice ${invoice.invoice_number} from ${company.name}`, html, text, {
    relatedType: "invoice",
    relatedId: invoice.id,
  })
}
'''

with open(p, 'ab') as f:
    f.write(part_c)
print('part C:', len(part_c))
