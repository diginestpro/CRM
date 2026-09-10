"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import InvoiceForm from "../../_components/InvoiceForm"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import { createClientBrowser } from "@/lib/supabase/client"

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [initialData, setInitialData] = useState<any | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClientBrowser()
        // Fetch invoice + per-invoice gateways in parallel. We do NOT
        // use an embedded `invoice_items(*, services(...))` join here:
        // PostgREST only resolves nested-resource joins when the FK
        // exists in the schema cache, and if it ever drops the request
        // returns HTTP 400 with an unhelpful message. The two-step
        // version below is more resilient.
        const [invRes, itemsRes, pmRes] = await Promise.all([
          supabase
            .from("invoices")
            .select("*")
            .eq("id", id)
            .maybeSingle(),
          supabase
            .from("invoice_items")
            .select("*")
            .eq("invoice_id", id),
          supabase
            .from("invoice_payment_methods")
            .select("payment_method")
            .eq("invoice_id", id),
        ])
        if (cancelled) return

        if (invRes.error) {
          setLoadError(invRes.error.message)
          return
        }
        if (!invRes.data) {
          setLoadError("Invoice not found.")
          return
        }

        // Resolve service names for the line items. The form already
        // carries `unit_price` per line, so we only need the name.
        const serviceIds = Array.from(
          new Set((itemsRes.data || []).map((it: any) => it.service_id).filter(Boolean))
        ) as string[]
        const servicesMap: Record<string, any> = {}
        if (serviceIds.length > 0 && !itemsRes.error) {
          const { data: services } = await supabase
            .from("services")
            .select("id, name, unit_price")
            .in("id", serviceIds)
          ;((services as any[]) || []).forEach((s: any) => { servicesMap[s.id] = s })
        }

        const items = (itemsRes.data || []).map((i: any) => ({
          service_id: i.service_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          description: i.description,
          service_name: servicesMap[i.service_id]?.name || null,
        }))

        const paymentMethods = (pmRes.data || []).map((r: any) => r.payment_method).filter(Boolean)

        // Don't pass fields the invoices table doesn't have — the form
        // already handles its own seeding for payment_methods etc.
        setInitialData({ ...invRes.data, items, payment_methods: paymentMethods })
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || "Failed to load invoice.")
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  if (loadError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild><Link href="/invoices"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Edit Invoice</h2>
            <p className="text-red-500">{loadError}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!initialData) {
    return (
      <div className="flex items-center justify-center p-12 gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading invoice...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild><Link href="/invoices"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Edit Invoice</h2>
            <p className="text-slate-500">Update the details of this invoice.</p>
          </div>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-8 shadow-sm">
        <InvoiceForm initialData={initialData} invoiceId={id} isEdit={true} />
      </div>
    </div>
  )
}
