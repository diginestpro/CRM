import { createClientServer } from "@/lib/supabase/server"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search } from "lucide-react"
import Link from "next/link"
import { InvoiceRowActions } from "@/components/billing/invoice-row-actions"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { ReceiptText } from "lucide-react"

export default async function InvoicesPage() {
  const supabase = await createClientServer()
  const { data: invoices, error } = await supabase.from("invoices").select("*, clients(full_name, company_name)").order("created_at", { ascending: false })
  if (error) return <div className="p-6 text-red-500">Error loading invoices: {error.message}</div>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Manage your billing and track payments."
        actions={
          <Link href="/invoices/new" className="h-10 px-4 rounded-xl bg-brand-gradient text-white text-sm font-medium shadow-lg shadow-indigo-500/25 hover:opacity-90 transition-opacity inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> New Invoice
          </Link>
        }
      />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input placeholder="Search invoices..." className="pl-9 h-10 bg-white border-slate-200 rounded-xl" />
        </div>
      </div>

      {invoices && invoices.length > 0 ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                <TableHead className="font-semibold">Invoice #</TableHead>
                <TableHead className="font-semibold">Client</TableHead>
                <TableHead className="font-semibold">Date</TableHead>
                <TableHead className="font-semibold">Due Date</TableHead>
                <TableHead className="font-semibold">Total Amount</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="text-right font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium text-slate-900">{invoice.invoice_number}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-slate-900 font-medium">{invoice.clients?.full_name}</span>
                      <span className="text-xs text-slate-500">{invoice.clients?.company_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600">{new Date(invoice.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-slate-600">{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "N/A"}</TableCell>
                  <TableCell className="font-medium text-slate-900">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(invoice.total_amount)}</TableCell>
                  <TableCell><StatusBadge status={invoice.status} /></TableCell>
                  <TableCell className="text-right"><InvoiceRowActions invoiceId={invoice.id} invoiceNumber={invoice.invoice_number} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          icon={ReceiptText}
          title="No invoices yet"
          description="Create your first invoice to start tracking payments."
          actionLabel="Create Invoice"
          actionHref="/invoices/new"
        />
      )}
    </div>
  )
}
