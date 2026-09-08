import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, FileText, ReceiptText, CreditCard } from "lucide-react"
import { createClientServer } from "@/lib/supabase/server"

export default async function DashboardPage() {
  const supabase = await createClientServer()
  const [clientsCount, quotationsCount, invoicesCount, revenueData] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("quotations").select("id", { count: "exact", head: true }).eq("status", "Sent"),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "Unpaid"),
    supabase.from("invoice_payments").select("amount").eq("status", "Completed")
  ])
  const totalRevenue = revenueData.data?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Overview</h2>
        <p className="text-slate-500">Welcome back! Heres whats happening with your business.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Clients" value={clientsCount.count?.toString() || "0"} icon={Users} description="Registered clients" />
        <StatCard title="Open Quotations" value={quotationsCount.count?.toString() || "0"} icon={FileText} description="Awaiting response" />
        <StatCard title="Pending Invoices" value={invoicesCount.count?.toString() || "0"} icon={ReceiptText} description="Unpaid invoices" />
        <StatCard title="Revenue" value={"$" + totalRevenue.toLocaleString()} icon={CreditCard} description="Total collected" />
      </div>
    </div>
  )
}

function StatCard({ title, value, icon: Icon, description }: { title: string; value: string; icon: any; description: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
        <Icon className="h-4 w-4 text-slate-400" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-slate-500">{description}</p>
      </CardContent>
    </Card>
  )
}
