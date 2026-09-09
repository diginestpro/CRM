"use client"

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
