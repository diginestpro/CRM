import os

def write_file(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

new_quotation_page = r'''"use client"

import { useRouter } from "next/navigation"
import QuotationForm from "../_components/QuotationForm"

export default function NewQuotationPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">New Quotation</h2>
          <p className="text-slate-500">Create a new quote for your client.</p>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-8 shadow-sm">
        <QuotationForm />
      </div>
    </div>
  )
}
'''

edit_quotation_page = r'''"use client"

import { use } from "react"
import { useRouter } from "next/navigation"
import QuotationForm from "../../_components/QuotationForm"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { createClientBrowser } from "@/lib/supabase/client"

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  const supabase = createClientBrowser()
  const { data: quotation, error } = await supabase
    .from("quotations")
    .select("*, quotation_items(*)")
    .eq("id", id)
    .single()
  
  if (error || !quotation) {
    return <div className="p-6 text-center">Error loading quotation details.</div>
  }

  const items = (quotation.quotation_items || []).map((i: any) => ({
    service_id: i.service_id,
    quantity: i.quantity,
    unit_price: i.unit_price,
    description: i.description,
  }))

  const initialData = { ...quotation, items }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild><Link href="/quotations"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Edit Quotation</h2>
            <p className="text-slate-500">Update the details of this quote.</p>
          </div>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-8 shadow-sm">
        <QuotationForm initialData={initialData} quotationId={id} isEdit={true} />
      </div>
    </div>
  )
}
'''

write_file(r"C:\Users\LENOVO\Desktop\CRM\app\(authed)\quotations\new\page.tsx", new_quotation_page)
write_file(r"C:\Users\LENOVO\Desktop\CRM\app\(authed)\quotations\[id]\edit\page.tsx", edit_quotation_page)
