import os

def write_file(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

new_invoice_page = r'''"use client"

import { useRouter } from "next/navigation"
import InvoiceForm from "../_components/InvoiceForm"

export default function NewInvoicePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">New Invoice</h2>
          <p className="text-slate-500">Create a new professional invoice for your client.</p>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-8 shadow-sm">
        <InvoiceForm />
      </div>
    </div>
  )
}
'''

edit_invoice_page = r'''"use client"

import { use } from "react"
import { useRouter } from "next/navigation"
import InvoiceForm from "../../_components/InvoiceForm"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { createClientBrowser } from "@/lib/supabase/client"

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  const supabase = createClientBrowser()
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("*, invoice_items(*)")
    .eq("id", id)
    .single()
  
  if (error || !invoice) {
    return <div className="p-6 text-center">Error loading invoice details.</div>
  }

  const items = (invoice.invoice_items || []).map((i: any) => ({
    service_id: i.service_id,
    quantity: i.quantity,
    unit_price: i.unit_price,
    description: i.description,
  }))

  const initialData = { ...invoice, items }

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
'''

write_file(r"C:\Users\LENOVO\Desktop\CRM\app\(authed)\invoices\new\page.tsx", new_invoice_page)
write_file(r"C:\Users\LENOVO\Desktop\CRM\app\(authed)\invoices\[id]\edit\page.tsx", edit_invoice_page)
