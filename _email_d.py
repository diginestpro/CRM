p = r'C:\Users\LENOVO\Desktop\CRM\lib\email.ts'
with open(p, 'rb') as f:
    c = f.read()

part_d = b'''

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
  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#10b981;">Payment Received</h2>
    <p style="margin:0 0 16px;color:#64748b;font-size:14px;">Hi ${client.full_name || "there"},</p>
    <p style="font-size:14px;line-height:1.6;">Thank you for your payment of <strong>${formatMoney(invoice.amount_paid, currency)}</strong> on invoice <strong>${invoice.invoice_number}</strong>.</p>
    ${balance > 0 ? `<p style="font-size:14px;line-height:1.6;color:#f59e0b;">Your remaining balance is <strong>${formatMoney(balance, currency)}</strong>.</p>` : `<p style="font-size:14px;line-height:1.6;color:#10b981;">Your invoice is now paid in full.</p>`}
    <div style="text-align:center;margin:24px 0;">
      <a href="${getAppUrl()}/pay/${invoice.id}/receipt" style="display:inline-block;background:#10b981;color:white;padding:12px 32px;text-decoration:none;border-radius:6px;font-weight:600;">View Receipt</a>
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
  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#ef4444;">Invoice Overdue</h2>
    <p style="font-size:14px;">Invoice <strong>${invoice.invoice_number}</strong> was due on <strong>${invoice.due_date}</strong> and has not been paid.</p>
    <p style="font-size:14px;">Outstanding balance: <strong>${formatMoney(balance, currency)}</strong></p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${getAppUrl()}/pay/${invoice.id}" style="display:inline-block;background:#ef4444;color:white;padding:12px 32px;text-decoration:none;border-radius:6px;font-weight:600;">Pay Now</a>
    </div>
  `
  const html = buildEmailWrapper(company, content)
  return sendEmail(companyId, client.email, `Overdue: Invoice ${invoice.invoice_number}`, html,
    `Invoice ${invoice.invoice_number} is overdue. Outstanding: ${formatMoney(balance, currency)}.`,
    { relatedType: "overdue", relatedId: invoice.id })
}
'''

with open(p, 'ab') as f:
    f.write(part_d)
print('part D:', len(part_d))
