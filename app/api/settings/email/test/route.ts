import { NextResponse } from "next/server"
import nodemailer from "nodemailer"

export async function POST(req: Request) {
  try {
    const settings = await req.json()

    if (!settings.smtp_host || !settings.smtp_from_email) {
      return NextResponse.json({ error: "SMTP host and from email are required" }, { status: 400 })
    }

    const port = parseInt(settings.smtp_port || "587", 10)
    const secure = settings.smtp_secure === "ssl"

    const transporter = nodemailer.createTransport({
      host: settings.smtp_host,
      port: port,
      secure: secure,
      auth: settings.smtp_user ? { user: settings.smtp_user, pass: settings.smtp_password } : undefined,
      tls: settings.smtp_secure === "tls" ? { rejectUnauthorized: false } : undefined,
    })

    await transporter.verify()

    await transporter.sendMail({
      from: `"${settings.smtp_from_name || "NexusCRM"}" <${settings.smtp_from_email}>`,
      to: settings.smtp_from_email,
      subject: "NexusCRM - Test Email",
      text: "This is a test email from your NexusCRM SMTP configuration. If you received this, your email settings are working correctly!",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">Test Email Successful!</h2>
          <p>This is a test email from your <strong>NexusCRM</strong> SMTP configuration.</p>
          <p>If you received this, your email settings are working correctly!</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="color: #64748b; font-size: 12px;">SMTP Server: ${settings.smtp_host}:${port}</p>
        </div>
      `,
    })

    return NextResponse.json({ success: true, message: "Test email sent successfully" })
  } catch (e: any) {
    console.error("[Email Test Error]", e)
    return NextResponse.json({ error: e.message || "Failed to send test email" }, { status: 500 })
  }
}
