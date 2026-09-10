import { createClientServer } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowLeft, FileText, CheckCircle, Clock, XCircle, Printer } from "lucide-react"
import { cn } from "@/lib/utils"
import { QuotationActions } from "@/components/billing/quotation-actions"
import { QuotationPrintLayout } from "@/components/quotations/quotation-print"
import { resolveBranding, buildLegalFooterLinks } from "@/lib/branding"

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClientServer()

  let quotation: any = null
  let queryError: any = null

  try {
    const result = await supabase.from("quotations").select("*").eq("id", id).maybeSingle()
    quotation = result.data
    queryError = result.error

    if (quotation) {
      if (quotation.client_id) {
        const { data: cli } = await supabase.from("clients").select("*").eq("id", quotation.client_id).maybeSingle()
        quotation.clients = cli
      }

      // Load the company + branding + legal-footer links so the
      // printed quotation carries the same Refund Policy / Terms &
      // Conditions links as the rest of the app.
      if (quotation.company_id) {
        const { data: comp } = await supabase.from("companies").select("*").eq("id", quotation.company_id).maybeSingle()
        quotation.companies = comp
        const { data: appSettingsRow } = await supabase
          .from("app_settings")
          .select("*")
          .eq("company_id", quotation.company_id)
          .maybeSingle()
        quotation.branding = resolveBranding({
          company: comp,
          appSettings: appSettingsRow,
          footerText: comp?.footer_text ?? null,
        })
        quotation.footer_links = buildLegalFooterLinks(quotation.branding)
      }

      const { data: items } = await supabase.from("quotation_items").select("*").eq("quotation_id", quotation.id)
      quotation.quotation_items = items || []

      if (quotation.quotation_items.length > 0) {
        const serviceIds = quotation.quotation_items.map((i: any) => i.service_id).filter(Boolean)
        if (serviceIds.length > 0) {
          const { data: services } = await supabase.from("services").select("*").in("id", serviceIds)
          const serviceMap: Record<string, any> = {}
          ;((services as any[]) || []).forEach((s: any) => { serviceMap[s.id] = s })
          quotation.quotation_items = quotation.quotation_items.map((item: any) => ({
            ...item,
            services: serviceMap[item.service_id] || null
          }))
        }
      }
    }
  } catch (e) {
    queryError = e
  }

  if (queryError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="text-red-800 font-semibold">Error loading quotation</h3>
          <p className="text-red-700 text-sm mt-1">{queryError.message}</p>
        </div>
      </div>
    )
  }

  if (!quotation) {
    notFound()
  }

  if (!quotation.quotation_items) quotation.quotation_items = []

  const statusStyles: any = {
    Draft: { bg: "bg-slate-100 text-slate-700", icon: Clock },
    Sent: { bg: "bg-blue-100 text-blue-700", icon: FileText },
    Accepted: { bg: "bg-green-100 text-green-700", icon: CheckCircle },
    Rejected: { bg: "bg-red-100 text-red-700", icon: XCircle },
  }
  const style = statusStyles[quotation.status] || statusStyles.Draft
  const StatusIcon = style.icon

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/quotations"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Quotation {quotation.quotation_number}</h2>
            <p className="text-slate-500">View and manage the details of this quotation.</p>
          </div>
        </div>
        <QuotationActions quotationId={id} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:hidden">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
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
                  {quotation.quotation_items.length > 0 ? (
                    quotation.quotation_items.map((item: any) => (
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
                    <TableRow><TableCell colSpan={4} className="text-center text-slate-500 py-8">No items in this quotation.</TableCell></TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-bold">Grand Total</TableCell>
                    <TableCell className="text-right font-bold text-lg">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(quotation.total_amount)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Status</span>
                <span className={cn("px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1", style.bg)}>
                  <StatusIcon className="h-3 w-3" />
                  {quotation.status}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Date Created</span>
                <span className="text-sm">{new Date(quotation.issue_date || quotation.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Valid Until</span>
                <span className="text-sm">{quotation.expiry_date ? new Date(quotation.expiry_date).toLocaleDateString() : "N/A"}</span>
              </div>
              <div className="pt-4 border-t">
                <span className="text-slate-500 block mb-2">Client</span>
                {quotation.clients ? (
                  <div className="flex flex-col">
                    <span className="font-bold">{quotation.clients.full_name}</span>
                    {quotation.clients.company_name && <span className="text-sm text-slate-600">{quotation.clients.company_name}</span>}
                    {quotation.clients.email && <span className="text-sm text-slate-600">{quotation.clients.email}</span>}
                  </div>
                ) : (
                  <span className="text-slate-400 text-sm">No client info</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Printed copy — hidden on screen, revealed by Ctrl+P.
          Carries the Refund Policy / Terms & Conditions links via
          the quotation.footer_links resolved above. */}
      <QuotationPrintLayout quotation={quotation} />
    </div>
  )
}
