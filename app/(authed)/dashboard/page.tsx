import { Users, FileText, ReceiptText, CreditCard, TrendingUp, Clock, ArrowRight, Sparkles, Wallet, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { createClientServer } from "@/lib/supabase/server"
import { PageHeader } from "@/components/layout/page-header"
import { StatCard } from "@/components/layout/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"

export const dynamic = "force-dynamic"

function fmtMoney(n: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n || 0)
  } catch {
    return `$${(n || 0).toFixed(0)}`
  }
}

export default async function DashboardPage() {
  const supabase = await createClientServer()

  const [
    clientsCount,
    quotationsSent,
    quotationsDraft,
    invoicesUnpaid,
    invoicesOverdue,
    revenueAllTime,
    revenueThisMonth,
    recentInvoices,
    pendingPayments,
  ] = await Promise.all([
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("quotations").select("id", { count: "exact", head: true }).eq("status", "Sent"),
    supabase.from("quotations").select("id", { count: "exact", head: true }).eq("status", "Draft"),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "Unpaid"),
    supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "Overdue"),
    supabase.from("invoice_payments").select("amount").eq("status", "Completed"),
    supabase.from("invoice_payments").select("amount, payment_date").eq("status", "Completed")
      .gte("payment_date", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]),
    supabase.from("invoices").select("id, invoice_number, total_amount, currency_code, status, due_date, created_at, clients(full_name)")
      .order("created_at", { ascending: false }).limit(6),
    supabase.from("invoices").select("id, invoice_number, total_amount, currency_code, due_date, status, clients(full_name)")
      .in("status", ["Unpaid", "Overdue"]).order("due_date", { ascending: true }).limit(5),
  ])

  const totalRevenue = revenueAllTime.data?.reduce((s, r) => s + (r.amount || 0), 0) || 0
  const monthRevenue = revenueThisMonth.data?.reduce((s, r) => s + (r.amount || 0), 0) || 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Welcome back — here's a snapshot of your business today."
        actions={
          <>
            <Link href="/quotations/new" className="h-10 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 text-sm font-medium inline-flex items-center gap-2 transition-colors">
              <FileText className="h-4 w-4" /> New Quotation
            </Link>
            <Link href="/invoices/new" className="h-10 px-4 rounded-xl bg-brand-gradient text-white text-sm font-medium shadow-lg shadow-indigo-500/25 hover:opacity-90 transition-opacity inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> New Invoice
            </Link>
          </>
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Revenue"
          value={fmtMoney(totalRevenue)}
          description="All-time collected"
          icon={Wallet}
          iconClassName="bg-emerald-50 text-emerald-600"
          trend={{ value: "+12.5%", direction: "up" }}
        />
        <StatCard
          title="This Month"
          value={fmtMoney(monthRevenue)}
          description="Current month"
          icon={TrendingUp}
          iconClassName="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          title="Pending Invoices"
          value={invoicesUnpaid.count?.toString() || "0"}
          description="Awaiting payment"
          icon={ReceiptText}
          iconClassName="bg-amber-50 text-amber-600"
        />
        <StatCard
          title="Overdue"
          value={invoicesOverdue.count?.toString() || "0"}
          description="Past due date"
          icon={Clock}
          iconClassName="bg-rose-50 text-rose-600"
        />
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Clients"
          value={clientsCount.count?.toString() || "0"}
          description="Registered"
          icon={Users}
          iconClassName="bg-sky-50 text-sky-600"
        />
        <StatCard
          title="Open Quotations"
          value={quotationsSent.count?.toString() || "0"}
          description="Awaiting response"
          icon={FileText}
          iconClassName="bg-violet-50 text-violet-600"
        />
        <StatCard
          title="Draft Quotations"
          value={quotationsDraft.count?.toString() || "0"}
          description="Not sent yet"
          icon={CheckCircle2}
          iconClassName="bg-slate-100 text-slate-600"
        />
        <StatCard
          title="Quick Action"
          value="Add Client"
          description="Start onboarding"
          icon={CreditCard}
          iconClassName="bg-rose-50 text-rose-600"
          footer={
            <Link href="/clients/new" className="text-rose-600 hover:text-rose-700 font-medium inline-flex items-center gap-1">
              Create <ArrowRight className="h-3 w-3" />
            </Link>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Recent Invoices</h3>
              <p className="text-xs text-slate-500">Latest billing activity</p>
            </div>
            <Link href="/invoices" className="text-xs font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentInvoices.data && recentInvoices.data.length > 0 ? recentInvoices.data.map((inv: any) => (
              <Link
                key={inv.id}
                href={`/invoices/${inv.id}`}
                className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{inv.invoice_number}</p>
                  <p className="text-xs text-slate-500 truncate">{inv.clients?.full_name || "—"}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">{fmtMoney(inv.total_amount, inv.currency_code || "USD")}</p>
                  <p className="text-[11px] text-slate-400">{new Date(inv.created_at).toLocaleDateString()}</p>
                </div>
                <StatusBadge status={inv.status} />
              </Link>
            )) : (
              <div className="px-5 py-12 text-center text-sm text-slate-500">No invoices yet. Create your first invoice to get started.</div>
            )}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Needs Attention</h3>
              <p className="text-xs text-slate-500">Unpaid & overdue</p>
            </div>
            <Link href="/invoices" className="text-xs font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1">
              All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingPayments.data && pendingPayments.data.length > 0 ? pendingPayments.data.map((inv: any) => (
              <Link
                key={inv.id}
                href={`/invoices/${inv.id}`}
                className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{inv.invoice_number}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {inv.clients?.full_name || "—"} · Due {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}
                  </p>
                </div>
                <div className="text-right flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{fmtMoney(inv.total_amount, inv.currency_code || "USD")}</span>
                  <StatusBadge status={inv.status} />
                </div>
              </Link>
            )) : (
              <div className="px-5 py-12 text-center">
                <div className="mx-auto h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-slate-900">All caught up!</p>
                <p className="text-xs text-slate-500 mt-0.5">No pending payments</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
