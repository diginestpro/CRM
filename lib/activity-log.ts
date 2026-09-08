import { createClientServer } from "@/lib/supabase/server"

export async function logActivity(
  action: string,
  details?: {
    entity_type?: string
    entity_id?: string
    metadata?: Record<string, any>
  }
) {
  try {
    const supabase = await createClientServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle()

    if (!profile?.company_id) return

    await supabase.from("activity_logs").insert({
      company_id: profile.company_id,
      user_id: user.id,
      action,
      entity_type: details?.entity_type,
      entity_id: details?.entity_id,
      metadata: details?.metadata || {},
      ip_address: null,
      user_agent: null,
    })
  } catch (e) {
    console.error("[logActivity] error:", e)
  }
}

export async function logPaymentEvent(
  event: "payment_initiated" | "payment_succeeded" | "payment_failed" | "payment_refunded",
  invoiceId: string,
  gateway: string,
  amount: number,
  metadata?: Record<string, any>
) {
  await logActivity(event, {
    entity_type: "invoice",
    entity_id: invoiceId,
    metadata: { gateway, amount, ...metadata },
  })
}
