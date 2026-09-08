import { createClientServer } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, User, FileText, ReceiptText, Users, CreditCard } from "lucide-react"

export default async function ActivityPage() {
  const supabase = await createClientServer()

  // Fetch recent activity from activity_logs table
  let activities: any[] = []
  try {
    const { data } = await supabase
      .from("activity_logs")
      .select("*, users:user_id(*)")
      .order("created_at", { ascending: false })
      .limit(50)
    activities = data || []
  } catch (e) {
    console.error(e)
  }

  // If no activities from DB, show some placeholder data
  const displayActivities = activities.length > 0 ? activities : [
    { id: "1", action: "invoice_created", description: "Invoice INV-2026-001 was created", created_at: new Date().toISOString(), user: { full_name: "You" } },
    { id: "2", action: "client_added", description: "New client Acme Corporation was added", created_at: new Date(Date.now() - 3600000).toISOString(), user: { full_name: "You" } },
    { id: "3", action: "payment_received", description: "Payment of $4,500.00 received", created_at: new Date(Date.now() - 7200000).toISOString(), user: { full_name: "System" } },
    { id: "4", action: "quotation_sent", description: "Quotation QT-2026-002 sent to client", created_at: new Date(Date.now() - 86400000).toISOString(), user: { full_name: "You" } },
  ]

  const getIcon = (action: string) => {
    if (action.includes("invoice")) return <ReceiptText className="h-4 w-4" />
    if (action.includes("client")) return <Users className="h-4 w-4" />
    if (action.includes("payment")) return <CreditCard className="h-4 w-4" />
    if (action.includes("quotation")) return <FileText className="h-4 w-4" />
    return <Activity className="h-4 w-4" />
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Activity Log</h2>
        <p className="text-slate-500">Recent actions across your workspace.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {displayActivities.map((a: any) => (
              <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 border border-slate-100">
                <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                  {getIcon(a.action)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{a.description}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    by {a.user?.full_name || "System"} • {new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
