import { NextResponse } from "next/server"
import { createClientServer } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { sendEmail, buildEmailWrapper } from "@/lib/email"
import { getAppSettings } from "@/lib/payment-gateways"

// Invite a new team member. Flow:
//   1. Admin POSTs { email, full_name?, role?, password? }.
//   2. Server creates the auth user (using supplied password or a
//      strong temp password if none was supplied).
//   3. Server upserts the profile row, linking to admin's company.
//   4. Server sends a real invite email via the company SMTP that
//      includes a login URL, the company brand, and (if no password
//      was provided) instructions for setting one.
export async function POST(request: Request) {
  try {
    const supabase = await createClientServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, role, full_name, email")
      .eq("id", user.id)
      .maybeSingle()

    if (!profile?.company_id) {
      return NextResponse.json({ error: "No company associated" }, { status: 400 })
    }
    if (profile.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can invite members" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { email, full_name, role, password } = body

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 })
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    // Decide which password to use. The admin can either:
    //   (a) supply one - the user can sign in immediately
    //   (b) leave it blank - we generate a temp password and email
    //       them a recovery link so they can set their own
    const suppliedPassword: string | null =
      typeof password === "string" && password.length > 0 ? password : null

    let tempPassword: string
    if (suppliedPassword) {
      if (suppliedPassword.length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters" },
          { status: 400 }
        )
      }
      tempPassword = suppliedPassword
    } else {
      const bytes = new Uint8Array(18)
      if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        crypto.getRandomValues(bytes)
      } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
      }
      tempPassword =
        Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 24) +
        "!A1a"
    }

    // Create the auth user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })

    if (createError || !newUser?.user) {
      const msg = createError?.message || "Failed to create user"
      if (/already.*registered|already.*exists/i.test(msg)) {
        return NextResponse.json(
          { error: "A user with this email already exists." },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // Use the service-role admin client for the profile upsert so the
    // RLS policy on profiles doesn't silently block us. The current
    // session user already authorised the invite on the line above
    // (profile.role === "admin"); the admin client bypasses RLS only
    // for this single write.
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: newUser.user.id,
        company_id: profile.company_id,
        role: role || "user",
        full_name: full_name || email.split("@")[0],
        email,
        updated_at: new Date().toISOString(),
      })

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    // If the admin did not set a password, ask Supabase to send the
    // user a recovery email so they can set their own.
    let recoveryLinkSent = false
    if (!suppliedPassword) {
      try {
        let baseUrl = process.env.NEXT_PUBLIC_APP_URL || ""
        try {
          const settings = await getAppSettings(profile.company_id)
          if (settings?.app_url) baseUrl = settings.app_url
        } catch (e) { /* ignore */ }
        const redirectTo = `${baseUrl.replace(/\/+$/, "")}/reset-password`

        const { error: recErr } = await adminClient.auth.resetPasswordForEmail(email, {
          redirectTo,
        })
        if (!recErr) recoveryLinkSent = true
        else console.warn("[team/invite] resetPasswordForEmail:", recErr.message)
      } catch (e: any) {
        console.warn("[team/invite] resetPasswordForEmail threw:", e?.message)
      }
    }

    // Send the custom branded invite email via the company's SMTP
    const customEmail = await sendCustomInviteEmail({
      adminClient,
      profile,
      email,
      fullName: full_name || email,
      role: role || "user",
      newUserId: newUser.user.id,
      suppliedPassword,
    })

    return NextResponse.json({
      success: true,
      message: suppliedPassword
        ? "Invitation sent. The user can sign in with the temporary password."
        : "Invitation sent. The user will receive a separate email with a one-time link to set their password.",
      userId: newUser.user.id,
      recoveryEmailSent: recoveryLinkSent,
      customInviteEmailSent: customEmail.ok,
      customInviteEmailError: customEmail.error,
    })
  } catch (e: any) {
    console.error("[team/invite] error:", e)
    return NextResponse.json(
      { error: e?.message || "Failed", name: e?.name || null },
      { status: 500 }
    )
  }
}

// Build and send a branded invite email using the company's SMTP.
async function sendCustomInviteEmail(args: {
  adminClient: any
  profile: any
  email: string
  fullName: string
  role: string
  newUserId: string
  suppliedPassword: string | null
}): Promise<{ ok: boolean; error: string | null }> {
  const { adminClient, profile, email, fullName, role, newUserId, suppliedPassword } = args

  try {
    const { data: company } = await adminClient
      .from("companies")
      .select("*")
      .eq("id", profile.company_id)
      .maybeSingle()

    let appSettings: any = null
    try {
      appSettings = await getAppSettings(profile.company_id)
    } catch (e) { /* ignore */ }

    const brandName = appSettings?.brand_name || company?.name || "DigiNest Solutions"
    const companyWebsite = appSettings?.company_website || "https://diginest.pro"
    const brandColor = company?.brand_color || "#2563eb"

    const companyBranding: any = {
      name: company?.name || brandName,
      logo_url: company?.logo_url,
      email: company?.email, phone: company?.phone, website: company?.website,
      address: company?.address, city: company?.city, state: company?.state,
      zip: company?.zip, country: company?.country, tagline: company?.tagline,
      brand_color: brandColor, footer_text: company?.footer_text,
      branding: {
        brand_name: brandName, company_website: companyWebsite,
        footer_text: company?.footer_text ?? null,
        copyright_year: String(new Date().getFullYear()),
        is_overridden: !!appSettings?.brand_name,
      },
      footer_links: {
        refund_policy: companyWebsite.replace(/\/+$/, "") + "/return-refund-policy-service-based-only/",
        website: companyWebsite.replace(/\/+$/, "") + "/",
        terms: companyWebsite.replace(/\/+$/, "") + "/terms-and-conditions/",
      },
    }

    let loginBase = process.env.NEXT_PUBLIC_APP_URL || ""
    try {
      const settings = await getAppSettings(profile.company_id)
      if (settings?.app_url) loginBase = settings.app_url
    } catch (e) { /* ignore */ }
    const loginUrl = loginBase.replace(/\/+$/, "") + "/login"
    const resetUrl = loginBase.replace(/\/+$/, "") + "/reset-password"

    const roleLabel = role === "admin" ? "Administrator" : "Team Member"
    const subject = `You've been invited to ${brandName}`

    const inviteBody = renderInviteEmail({
      fullName,
      adminName: profile.full_name || profile.email || "An administrator",
      brandName,
      roleLabel,
      loginUrl,
      resetUrl,
      brandColor,
      suppliedPassword,
    })

    const html = buildEmailWrapper(companyBranding, inviteBody.html)
    const text = inviteBody.text

    const emailRes = await sendEmail(
      profile.company_id, email, subject, html, text,
      { relatedType: "team_invite", relatedId: newUserId }
    )
    if (emailRes.ok) return { ok: true, error: null }
    return { ok: false, error: emailRes.error || "send failed" }
  } catch (e: any) {
    console.warn("[team/invite] custom email error:", e?.message)
    return { ok: false, error: e?.message || "unknown error" }
  }
}

// Render the invite email HTML + plain-text body.
function renderInviteEmail(opts: {
  fullName: string
  adminName: string
  brandName: string
  roleLabel: string
  loginUrl: string
  resetUrl: string
  brandColor: string
  suppliedPassword: string | null
}): { html: string; text: string } {
  const { fullName, adminName, brandName, roleLabel, loginUrl, resetUrl, brandColor, suppliedPassword } = opts
  const safe = (s: string) => escapeHtml(s)

  const passwordBox = suppliedPassword ? `
          <div style="margin:0 0 16px;padding:12px 16px;background:#f1f5f9;border-radius:8px;font-size:13px;line-height:1.6;color:#475569;">
            <strong>Temporary password:</strong>
            <code style="background:#fff;padding:2px 6px;border-radius:4px;border:1px solid #e2e8f0;font-family:monospace;">${safe(suppliedPassword)}</code>
            <br />Change it after you log in.
          </div>` : ""

  const resetBox = suppliedPassword ? "" : `
          <div style="margin:0 0 16px;padding:12px 16px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:4px;font-size:13px;line-height:1.6;color:#78350f;">
            <strong>Set your password first.</strong> We just sent you a separate email with a
            one-time link to choose your password. The link expires in 1 hour.
          </div>
          <p style="margin:0 0 8px;font-size:13px;color:#64748b;">
            Didn't get the password email? Use this link to request a new one:
          </p>
          <div style="text-align:center;margin:8px 0 24px;">
            <a href="${resetUrl}"
               style="display:inline-block;color:${brandColor};border:1px solid ${brandColor};padding:8px 20px;text-decoration:none;border-radius:8px;font-weight:600;font-size:13px;">
              Set my password
            </a>
          </div>`

  const html = `
        <h2 style="margin:0 0 16px;font-size:20px;color:#0f172a;">Welcome to the team</h2>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#334155;">
          Hi <strong>${safe(fullName)}</strong>,
        </p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">
          <strong>${safe(adminName)}</strong> just invited you to join
          <strong>${safe(brandName)}</strong> as a <strong>${safe(roleLabel)}</strong>.
        </p>
        <p style="margin:24px 0 8px;font-size:14px;line-height:1.6;color:#334155;">To get started, sign in here:</p>
        <div style="text-align:center;margin:16px 0 24px;">
          <a href="${loginUrl}"
             style="display:inline-block;background:${brandColor};color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">
            Sign in to ${safe(brandName)}
          </a>
        </div>
        ${passwordBox}
        ${resetBox}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="margin:0;font-size:12px;color:#94a3b8;">
          You received this email because an administrator added you to a workspace.
          If you weren't expecting this, you can ignore this email.
        </p>
  `

  const text = [
    `Welcome to the team`,
    ``,
    `Hi ${fullName},`,
    ``,
    `${adminName} just invited you to join ${brandName} as a ${roleLabel}.`,
    ``,
    `To get started, sign in here:`,
    loginUrl,
    ``,
    suppliedPassword
      ? `Temporary password: ${suppliedPassword}\nChange it after you log in.`
      : `Set your password first. We just sent you a separate email with a one-time link to choose your password. The link expires in 1 hour.\n\nDidn't get the password email? Use this link to request a new one:\n${resetUrl}`,
    ``,
    `You received this email because an administrator added you to a workspace.`,
    `If you weren't expecting this, you can ignore this email.`,
  ].join("\n")

  return { html, text }
}

// Minimal HTML escape for user-supplied values that go into the email body.
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
