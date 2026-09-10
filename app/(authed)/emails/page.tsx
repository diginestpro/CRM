import { createClientServer } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/layout/page-header"
import { EmailsQueueClient } from "./emails-queue-client"

export const dynamic = "force-dynamic"

export default async function EmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const supabase = await createClientServer()
  const sp = await searchParams
  const statusFilter = sp.status ?? "all"

  // Resolve the current user's company.
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = (await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user?.id ?? "")
    .maybeSingle())?.data?.company_id

  if (!user || !companyId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Email Queue"
          description="Sign in to a workspace to see its outbound emails."
        />
        <Card>
          <CardContent className="p-8 text-center text-slate-500">
            No company associated with your account.
          </CardContent>
        </Card>
      </div>
    )
  }

  // Fetch the latest 200 rows for this company. Status filter applied client-side
  // so the filter chips don't trigger a server round-trip on each click.
  const { data: rows, error } = await supabase
    .from("email_queue")
    .select(
      "id, to_email, from_email, subject, template, related_type, related_id, status, attempts, last_error, scheduled_for, sent_at, created_at"
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(200)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email Queue"
        description="Every email the system tries to send for your workspace. Pending emails haven't gone out yet — click Send to dispatch them manually. Failed emails keep their error message and retry counter."
      />
      <EmailsQueueClient
        rows={(rows ?? []) as any[]}
        initialStatus={statusFilter}
        loadError={error?.message ?? null}
      />
    </div>
  )
}
