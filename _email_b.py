p = r'C:\Users\LENOVO\Desktop\CRM\lib\email.ts'
with open(p, 'rb') as f:
    c = f.read()

part_b = b'''

export interface SendEmailResult {
  ok: boolean
  error?: string
  messageId?: string
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://crm.diginest.pro"
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
      tls: encryption === "tls" ? { rejectUnauthorized: false } : undefined,
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
'''

with open(p, 'ab') as f:
    f.write(part_b)
print('part B:', len(part_b))
