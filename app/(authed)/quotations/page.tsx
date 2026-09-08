import { createClientServer } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { QuotationRowActions } from "@/components/billing/quotation-row-actions"

export default async function QuotationsPage() {
  const supabase = await createClientServer()
  const { data: quotations, error } = await supabase.from("quotations").select("*, clients(full_name, company_name)").order("created_at", { ascending: false })
  if (error) return <div className="p-6 text-red-500">Error loading quotations: {error.message}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Quotations</h2>
          <p className="text-slate-500">Create and manage professional quotes for your clients.</p>
        </div>
        <Button asChild><Link href="/quotations/new" className="flex items-center gap-2"><Plus className="h-4 w-4" /> New Quotation</Link></Button>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search quotations..." className="pl-9" />
        </div>
      </div>
      <div className="rounded-xl border bg-white shadow-sm">
        <Table>
          <TableHeader><TableRow><TableHead>Quote #</TableHead><TableHead>Client</TableHead><TableHead>Date</TableHead><TableHead>Total Amount</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {quotations && quotations.length > 0 ? quotations.map((quote) => (
              <TableRow key={quote.id}>
                <TableCell className="font-medium text-slate-900">{quote.quotation_number}</TableCell>
                <TableCell><div className="flex flex-col"><span className="text-slate-900 font-medium">{quote.clients?.full_name}</span><span className="text-xs text-slate-500">{quote.clients?.company_name}</span></div></TableCell>
                <TableCell className="text-slate-600">{new Date(quote.issue_date || quote.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="font-medium text-slate-900">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(quote.total_amount)}</TableCell>
                <TableCell><span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", quote.status === "Accepted" ? "bg-green-100 text-green-700" : quote.status === "Rejected" ? "bg-red-100 text-red-700" : quote.status === "Sent" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700")}>{quote.status}</span></TableCell>
                <TableCell className="text-right"><QuotationRowActions quoteId={quote.id} /></TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={6} className="h-32 text-center text-slate-500">No quotations found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
