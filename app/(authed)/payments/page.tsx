"use client"

import { useEffect, useState } from "react"
import { createClientBrowser } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowDownRight, Clock, CreditCard } from "lucide-react"

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
    if (filter === "all") return true
    if (filter === "completed") return p.status === "Completed"
    if (filter === "pending") return p.status === "Pending"
    return true
  })

  const totalReceived = payments.filter(p => p.status === "Completed").reduce((s, p) => s + (p.amount || 0), 0)
  const totalPending = payments.filter(p => p.status === "Pending").reduce((s, p) => s + (p.amount || 0), 0)

  return (
    <div className="space-y-6">
      <div><h2 className="text-3xl font-bold tracking-tight text-slate-900">Payments</h2><p className="text-slate-500">Track all incoming and outgoing payments.</p></div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-slate-500">Total Received</CardTitle><ArrowDownRight className="h-4 w-4 text-green-500" /></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">${totalReceived.toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-slate-500">Pending</CardTitle><Clock className="h-4 w-4 text-orange-500" /></CardHeader><CardContent><div className="text-2xl font-bold text-orange-600">${totalPending.toLocaleString()}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-slate-500">Total Transactions</CardTitle><CreditCard className="h-4 w-4 text-blue-500" /></CardHeader><CardContent><div className="text-2xl font-bold">{payments.length}</div></CardContent></Card>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setFilter("all")} className={filter === "all" ? "px-3 py-1 rounded text-sm bg-blue-600 text-white" : "px-3 py-1 rounded text-sm border"}>All</button>
        <button type="button" onClick={() => setFilter("completed")} className={filter === "completed" ? "px-3 py-1 rounded text-sm bg-blue-600 text-white" : "px-3 py-1 rounded text-sm border"}>Completed</button>
        <button type="button" onClick={() => setFilter("pending")} className={filter === "pending" ? "px-3 py-1 rounded text-sm bg-blue-600 text-white" : "px-3 py-1 rounded text-sm border"}>Pending</button>
      </div>
      <div className="rounded-xl border bg-white shadow-sm">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Invoice</TableHead><TableHead>Client</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="h-32 text-center text-slate-500">No payments found.</TableCell></TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{new Date(p.payment_date).toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium">{p.invoices?.invoice_number || "-"}</TableCell>
                  <TableCell>{p.invoices?.clients?.full_name || "-"}</TableCell>
                  <TableCell>{p.payment_method || "-"}</TableCell>
                  <TableCell className="text-right font-medium">${(p.amount || 0).toLocaleString()}</TableCell>
                  <TableCell><span className={p.status === "Completed" ? "px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700" : "px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700"}>{p.status}</span></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
