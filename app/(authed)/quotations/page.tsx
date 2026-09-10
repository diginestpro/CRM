import { createClientServer } from "@/lib/supabase/server"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search, FileText } from "lucide-react"
import Link from "next/link"
import { QuotationRowActions } from "@/components/billing/quotation-row-actions"
import { PageHeader } from "@/components/layout/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"

export default async function QuotationsPage() {
  const supabase = await createClientServer()
  const { data: quotations, error } = await supabase.from("quotations").select("*, clients(full_name, company_name)").order("created_at", { ascending: false })
  if (error) return <div className="p-6 text-red-500">Error loading quotations: {error.message}</div>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotations"
        description="Create and manage professional quotes for your clients."
        actions={
          <Link href="/quotations/new" className="h-10 px-4 rounded-xl bg-brand-gradient text-white text-sm font-medium shadow-lg shadow-indigo-500/25 hover:opacity-90 transition-opacity inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> New Quotation
          </Link>
        }
      />
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input placeholder="Search quotations..." className="pl-9 h-10 bg-white border-slate-200 rounded-xl" />
        </div>
      </div>
      {quotations && quotations.length > 0 ? (
      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
              <TableHead className="font-semibold">Quote #</TableHead>
              <TableHead className="font-semibold">Client</TableHead>
              <TableHead className="font-semibold">Date</TableHead>
              <TableHead className="font-semibold">Total Amount</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quotations.map((quote) => (
              <TableRow key={quote.id} className="hover:bg-slate-50/50">
                <TableCell className="font-medium text-slate-900">{quote.quotation_number}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-slate-900 font-medium">{quote.clients?.full_name}</span>
                    <span className="text-xs text-slate-500">{quote.clients?.company_name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-slate-600">{new Date(quote.issue_date || quote.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="font-medium text-slate-900">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(quote.total_amount)}</TableCell>
                <TableCell><StatusBadge status={quote.status} /></TableCell>
                <TableCell className="text-right"><QuotationRowActions quoteId={quote.id} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="No quotations yet"
          description="Create your first quotation to send professional quotes to clients."
          actionLabel="Create Quotation"
          actionHref="/quotations/new"
        />
      )}
    </div>
  )
}
