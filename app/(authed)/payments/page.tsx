"use client"

import { useEffect, useState } from "react"
import { createClientBrowser } from "@/lib/supabase/client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Clock, CreditCard, Wallet, Search } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { StatCard } from "@/components/layout/stat-card"
import { StatusBadge } from "@/components/ui/status-badge"
import { Input } from "@/components/ui/input"

interface Payment {
  id: string
  invoice_id: string
  amount: number
  payment_method: string
  status: string
  payment_date: string
  invoices?: { invoice_number?: string; clients?: { full_name?: string } }
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")

  useEffect(() => {
    async function load() {
      try {
        const sb = createClientBrowser()
        const { data } = await sb.from("invoice_payments").select("*, invoices(invoice_number, clients(full_name))").order("payment_date", { ascending: false })
        setPayments((data as Payment[]) || [])
      } catch (e) { console.error(e) }
      finally { setIsLoading(false) }
    }
    load()
  }, [])

  const filtered = payments.filter(p => {
    if (filter === "completed" && p.status !== "Completed") return false
    if (filter === "pending" && p.status !== "Pending") return false
    if (search) {
      const q = search.toLowerCase()
      if (!((p.invoices?.invoice_number || "").toLowerCase().includes(q) ||
            (p.invoices?.clients?.full_name || "").toLowerCase().includes(q))) return false
    }
    return true
  })

  const totalReceived = payments.filter(p => p.status === "Completed").reduce((s, p) => s + (p.amount || 0), 0)
  const totalPending = payments.filter(p => p.status === "Pending").reduce((s, p) => s + (p.amount || 0), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Track all incoming and outgoing payments."
      />
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <StatCard
          title="Total Received"
          value={"$" + totalReceived.toLocaleString()}
          description="Completed payments"
          icon={Wallet}
          iconClassName="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          title="Pending"
          value={"$" + totalPending.toLocaleString()}
          description="Awaiting settlement"
          icon={Clock}
          iconClassName="bg-amber-50 text-amber-600"
        />
        <StatCard
          title="Total Transactions"
          value={payments.length.toString()}
          description="All-time"
          icon={CreditCard}
          iconClassName="bg-indigo-50 text-indigo-600"
        />
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setFilter("all")} className={filter === "all" ? "h-9 px-4 rounded-lg text-sm font-medium bg-indigo-600 text-white" : "h-9 px-4 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"}>All</button>
          <button type="button" onClick={() => setFilter("completed")} className={filter === "completed" ? "h-9 px-4 rounded-lg text-sm font-medium bg-emerald-600 text-white" : "h-9 px-4 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"}>Completed</button>
          <button type="button" onClick={() => setFilter("pending")} className={filter === "pending" ? "h-9 px-4 rounded-lg text-sm font-medium bg-amber-600 text-white" : "h-9 px-4 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"}>Pending</button>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input placeholder="Search payments..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 bg-white border-slate-200 rounded-lg" />
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
              <TableHead className="font-semibold">Date</TableHead>
              <TableHead className="font-semibold">Invoice</TableHead>
              <TableHead className="font-semibold">Client</TableHead>
              <TableHead className="font-semibold">Method</TableHead>
              <TableHead className="text-right font-semibold">Amount</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center text-slate-500">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-32 text-center text-slate-500">No payments found.</TableCell></TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id} className="hover:bg-slate-50/50">
                  <TableCell className="text-slate-600">{new Date(p.payment_date).toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium text-slate-900">{p.invoices?.invoice_number || "-"}</TableCell>
                  <TableCell className="text-slate-700">{p.invoices?.clients?.full_name || "-"}</TableCell>
                  <TableCell className="text-slate-600">{p.payment_method || "-"}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">${(p.amount || 0).toLocaleString()}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
