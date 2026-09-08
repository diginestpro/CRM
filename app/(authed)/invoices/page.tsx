import { createClientServer } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { InvoiceRowActions } from "@/components/billing/invoice-row-actions"

export default async function InvoicesPage() {
  const supabase = await createClientServer()
  const { data: invoices, error } = await supabase.from("invoices").select("*, clients(full_name, company_name)").order("created_at", { ascending: false })
  if (error) return <div className="p-6 text-red-500">Error loading invoices: {error.message}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Invoices</h2>
          <p className="text-slate-500">Manage your billing and track payments.</p>
        </div>
        <Button asChild><Link href="/invoices/new" className="flex items-center gap-2"><Plus className="h-4 w-4" /> New Invoice</Link></Button>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search invoices..." className="pl-9" />
        </div>
      </div>
      <div className="rounded-xl border bg-white shadow-sm">
        <Table>
          <TableHeader><TableRow><TableHead>Invoice #</TableHead><TableHead>Client</TableHead><TableHead>Date</TableHead><TableHead>Due Date</TableHead><TableHead>Total Amount</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {invoices && invoices.length > 0 ? invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium text-slate-900">{invoice.invoice_number}</TableCell>
                <TableCell><div className="flex flex-col"><span className="text-slate-900 font-medium">{invoice.clients?.full_name}</span><span className="text-xs text-slate-500">{invoice.clients?.company_name}</span></div></TableCell>
                <TableCell className="text-slate-600">{new Date(invoice.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-slate-600">{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "N/A"}</TableCell>
                <TableCell className="font-medium text-slate-900">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(invoice.total_amount)}</TableCell>
                <TableCell><span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", invoice.status === "Paid" ? "bg-green-100 text-green-700" : invoice.status === "Overdue" ? "bg-red-100 text-red-700" : invoice.status === "Unpaid" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700")}>{invoice.status}</span></TableCell>
                <TableCell className="text-right"><InvoiceRowActions invoiceId={invoice.id} invoiceNumber={invoice.invoice_number} /></TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={7} className="h-32 text-center text-slate-500">No invoices found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
