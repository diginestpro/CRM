import { NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { createClientServer } from "@/lib/supabase/server"

async function loadSmtp(companyId: string) {
  const supabase = await createClientServer()
  const { data } = await supabase
    .from("smtp_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle()
  return data
}

async function resolveCompanyId(): Promise<string | null> {
  const supabase = await createClientServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle()
  return profile?.company_id ?? null
}

export async function POST(req: Request) {
  try {
    const companyId = await resolveCompanyId()
    if (!companyId) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    // Either use provided settings or load saved ones
    let cfg: any = body
    if (!cfg || !cfg.host) {
      cfg = await loadSmtp(companyId)
    }

    if (!cfg?.host || !cfg?.from_email) {
      return NextResponse.json(
        { success: false, error: "SMTP host and from email are required. Save your SMTP settings first or pass them in the request body." },
        { status: 400 }
      )
    }

    const port = parseInt(String(cfg.port || 587), 10)
    const encryption = String(cfg.encryption || "tls").toLowerCase()
    const secure = encryption === "ssl"

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port,
      secure,
      auth: cfg.username ? { user: cfg.username, pass: cfg.password } : undefined,
      tls: encryption === "tls" ? { rejectUnauthorized: false } : undefined,
      connectionTimeout: 10000,
    })

    await transporter.verify()

    const toEmail = body?.to_email || cfg.from_email
    await transporter.sendMail({
      from: `"${cfg.from_name || "NexusCRM"}" <${cfg.from_email}>`,
      to: toEmail,
      subject: "NexusCRM - Test Email",
      text: "This is a test email from your NexusCRM SMTP configuration.",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">Test Email Successful!</h2>
          <p>This is a test email from your <strong>NexusCRM</strong> SMTP configuration.</p>
          <p>If you received this, your email settings are working correctly!</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="color: #64748b; font-size: 12px;">SMTP Server: ${cfg.host}:${port}</p>
        </div>
      `,
    })

    // Log the email send
    const supabase = await createClientServer()
    await supabase.from("email_log").insert({
      company_id: companyId,
      to_email: toEmail,
      from_email: cfg.from_email,
      subject: "NexusCRM - Test Email",
      template: "test",
      status: "sent",
    })

    return NextResponse.json({ success: true, message: "Test email sent successfully" })
  } catch (e: any) {
    console.error("[Email Test Error]", e)
    return NextResponse.json(
      { success: false, error: e.message || "Failed to send test email" },
      { status: 500 }
    )
  }
}
