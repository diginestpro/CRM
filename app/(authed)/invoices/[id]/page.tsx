import { createClientServer } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowLeft, FileText, CheckCircle, Clock, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { InvoiceActions } from "@/components/billing/invoice-actions"
import { loadFromBlock } from "@/lib/company-address"

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClientServer()

  let invoice: any = null
  let queryError: any = null

  try {
    const result = await supabase.from("invoices").select("*").eq("id", id).maybeSingle()
    invoice = result.data
    queryError = result.error

    if (invoice) {
      if (invoice.client_id) {
        const { data: cli } = await supabase.from("clients").select("*, client_addresses(*)").eq("id", invoice.client_id).maybeSingle()
        invoice.clients = cli
      }
      // Resolve the chosen address (if any) - prefer invoice.selected_address_id,
      // else fall back to the client's default address (or the first one)
      let address: any = null
      if (invoice.selected_address_id) {
        const { data: sel } = await supabase.from("client_addresses").select("*").eq("id", invoice.selected_address_id).maybeSingle()
        address = sel
      }
      if (!address && invoice.clients?.client_addresses) {
        address =
          invoice.clients.client_addresses.find((a: any) => a.is_default) ||
          invoice.clients.client_addresses[0] ||
          null
      }
      invoice.selected_address = address
      const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoice.id)
      invoice.invoice_items = items || []

      if (invoice.invoice_items.length > 0) {
        const serviceIds = invoice.invoice_items.map((i: any) => i.service_id).filter(Boolean)
        if (serviceIds.length > 0) {
          const { data: services } = await supabase.from("services").select("*").in("id", serviceIds)
          const serviceMap: Record<string, any> = {}
          ;((services as any[]) || []).forEach((s: any) => { serviceMap[s.id] = s })
          invoice.invoice_items = invoice.invoice_items.map((item: any) => ({
            ...item,
            services: serviceMap[item.service_id] || null
          }))
        }
      }

      // Load the company (From) info so the detail page header shows it too.
      if (invoice.company_id) {
        const { data: comp } = await supabase.from("companies").select("*").eq("id", invoice.company_id).maybeSingle()
        invoice.companies = comp
      }

      // Resolve the chosen office address (USA / Pakistan / UAE / ...) so the
      // "From" block on this invoice renders the picked office instead of
      // always defaulting to the legacy companies.address columns.
      invoice.from_block = await loadFromBlock(supabase, invoice)
      // Also expose the raw company_address row in case a UI needs it.
      if (invoice.company_address_id) {
        const { data: ca } = await supabase
          .from("company_addresses")
          .select("*")
          .eq("id", invoice.company_address_id)
          .maybeSingle()
        invoice.company_address = ca || null
      }

      // Load the full list of company offices so the picker on the edit
      // page (and the read-only detail view) can show what's available.
      if (invoice.company_id) {
        const { data: offices } = await supabase
          .from("company_addresses")
          .select("*")
          .eq("company_id", invoice.company_id)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true })
        invoice.company_offices = offices || []
      }
    }
  } catch (e) {
    queryError = e
  }

  if (queryError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="text-red-800 font-semibold">Error loading invoice</h3>
          <p className="text-red-700 text-sm mt-1">{queryError.message || "Unknown error"}</p>
        </div>
      </div>
    )
  }

  if (!invoice) {
    notFound()
  }

  if (!invoice.invoice_items) invoice.invoice_items = []

  const statusStyles: any = {
    Draft: { bg: "bg-slate-100 text-slate-700", icon: Clock },
    Sent: { bg: "bg-blue-100 text-blue-700", icon: FileText },
    Paid: { bg: "bg-green-100 text-green-700", icon: CheckCircle },
    Overdue: { bg: "bg-red-100 text-red-700", icon: AlertCircle },
    Unpaid: { bg: "bg-orange-100 text-orange-700", icon: AlertCircle },
  }
  const style = statusStyles[invoice.status] || statusStyles.Unpaid
  const StatusIcon = style.icon

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/invoices"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Invoice {invoice.invoice_number}</h2>
            <p className="text-slate-500">Billing details and payment status.</p>
          </div>
        </div>
        <InvoiceActions invoiceId={id} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:hidden">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Invoice Items</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.invoice_items.length > 0 ? (
                    invoice.invoice_items.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{item.services?.name || item.description || "Service"}</span>
                            <span className="text-xs text-slate-500">{item.description}</span>
                          </div>
                        </TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(item.unit_price)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(item.quantity * item.unit_price)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow><TableCell colSpan={4} className="text-center text-slate-500 py-8">No items in this invoice.</TableCell></TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-bold">Grand Total</TableCell>
                    <TableCell className="text-right font-bold text-lg">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(invoice.total_amount)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Status & Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Status</span>
                <span className={cn("px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1", style.bg)}>
                  <StatusIcon className="h-3 w-3" />
                  {invoice.status}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Date Issued</span>
                <span className="text-sm">{invoice.issue_date ? new Date(invoice.issue_date).toLocaleDateString() : new Date(invoice.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Due Date</span>
                <span className="text-sm">{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "N/A"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Total</span>
                <span className="text-lg font-bold">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(invoice.total_amount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Paid</span>
                <span className="text-sm text-green-600">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(invoice.amount_paid || 0)}</span>
              </div>
              {(invoice.amount_paid || 0) < invoice.total_amount && (
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-slate-500 font-medium">Remaining</span>
                  <span className="text-lg font-bold text-orange-600">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(invoice.total_amount - (invoice.amount_paid || 0))}
                  </span>
                </div>
              )}
              <div className="pt-4 border-t">
                <span className="text-slate-500 block mb-2">From</span>
                {invoice.from_block ? (
                  <div className="flex flex-col text-sm">
                    <span className="font-bold">{invoice.from_block.name}</span>
                    {invoice.from_block.address_name && (
                      <span className="text-xs text-slate-500 italic">{invoice.from_block.address_name}</span>
                    )}
                    {invoice.from_block.address_lines.map((line: string, idx: number) => (
                      <span key={idx} className="text-slate-600">{line}</span>
                    ))}
                    {invoice.from_block.email && <span className="text-slate-600">{invoice.from_block.email}</span>}
                    {invoice.from_block.phone && <span className="text-slate-600">{invoice.from_block.phone}</span>}
                  </div>
                ) : invoice.companies ? (
                  <div className="flex flex-col text-sm">
                    <span className="font-bold">{invoice.companies.name}</span>
                    {invoice.companies.address && <span className="text-slate-600">{invoice.companies.address}</span>}
                    {(invoice.companies.city || invoice.companies.state || invoice.companies.zip) && (
                      <span className="text-slate-600">
                        {[invoice.companies.city, invoice.companies.state, invoice.companies.zip].filter(Boolean).join(", ")}
                      </span>
                    )}
                    {invoice.companies.country && <span className="text-slate-600">{invoice.companies.country}</span>}
                    {invoice.companies.email && <span className="text-slate-600">{invoice.companies.email}</span>}
                    {invoice.companies.phone && <span className="text-slate-600">{invoice.companies.phone}</span>}
                  </div>
                ) : (
                  <span className="text-slate-400 text-sm">No company info</span>
                )}
              </div>
              <div className="pt-4 border-t">
                <span className="text-slate-500 block mb-2">Client</span>
                {invoice.clients ? (
                  <div className="flex flex-col">
                    <span className="font-bold">{invoice.clients.full_name}</span>
                    {invoice.clients.company_name && <span className="text-sm text-slate-600">{invoice.clients.company_name}</span>}
                    {invoice.clients.email && <span className="text-sm text-slate-600">{invoice.clients.email}</span>}
                    {invoice.selected_address && (
                      <div className="mt-3 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                        <div className="font-medium text-slate-700 mb-0.5">
                          {invoice.selected_address.label || "Billing Address"}
                        </div>
                        {invoice.selected_address.street && <div>{invoice.selected_address.street}</div>}
                        {(invoice.selected_address.city || invoice.selected_address.state || invoice.selected_address.postal_code) && (
                          <div>
                            {[invoice.selected_address.city, invoice.selected_address.state, invoice.selected_address.postal_code]
                              .filter(Boolean)
                              .join(", ")}
                          </div>
                        )}
                        {invoice.selected_address.country && <div>{invoice.selected_address.country}</div>}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-slate-400 text-sm">No client info</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
