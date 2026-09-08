import { createClientServer } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail, Phone, Globe, MapPin, FileText, ReceiptText, ArrowLeft } from "lucide-react"
import Link from "next/link"

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClientServer()

  let client: any = null
  let queryError: any = null

  try {
    const result = await supabase.from("clients").select("*").eq("id", id).maybeSingle()
    client = result.data
    queryError = result.error
  } catch (e) {
    queryError = e
  }

  if (queryError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="text-red-800 font-semibold">Error loading client</h3>
          <p className="text-red-700 text-sm mt-1">{queryError.message}</p>
        </div>
      </div>
    )
  }

  if (!client) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/clients"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">{client.full_name}</h2>
            {client.company_name && (
              <span className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-full">{client.company_name}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link href={`/clients/${id}/edit`}>Edit Client</Link></Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-1 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-slate-500">Contact Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 text-sm text-slate-600"><Mail className="h-4 w-4 text-slate-400" />{client.email || "No email provided"}</div>
              <div className="flex items-center gap-3 text-sm text-slate-600"><Phone className="h-4 w-4 text-slate-400" />{client.phone || "No phone provided"}</div>
              <div className="flex items-center gap-3 text-sm text-slate-600"><Globe className="h-4 w-4 text-slate-400" />{client.website ? <a href={client.website} target="_blank" className="text-blue-600 hover:underline">{client.website}</a> : "No website"}</div>
              <div className="flex items-center gap-3 text-sm text-slate-600"><MapPin className="h-4 w-4 text-slate-400" />{client.country || "No country provided"}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-slate-500">Billing Details</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm font-medium text-slate-900">Tax Number: <span className="text-slate-600 ml-1">{client.tax_number || "Not provided"}</span></div>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <Card className="cursor-pointer hover:border-blue-300 transition-colors">
                  <CardContent className="flex flex-col items-center justify-center p-6 text-center space-y-2">
                    <FileText className="h-8 w-8 text-blue-500" />
                    <div className="font-semibold">Quotations</div>
                    <div className="text-xs text-slate-500">View and manage all quotes</div>
                  </CardContent>
                </Card>
                <Card className="cursor-pointer hover:border-blue-300 transition-colors">
                  <CardContent className="flex flex-col items-center justify-center p-6 text-center space-y-2">
                    <ReceiptText className="h-8 w-8 text-green-500" />
                    <div className="font-semibold">Invoices</div>
                    <div className="text-xs text-slate-500">View and manage all billing</div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-medium text-slate-500">Notes</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{client.notes || "No notes added for this client."}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
