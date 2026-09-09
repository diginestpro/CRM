"use client"

import { useRouter } from "next/navigation"
import ClientForm from "../_components/ClientForm"

export default function NewClientPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">New Client</h2>
          <p className="text-slate-500">Add a new client to your CRM.</p>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-8 shadow-sm max-w-3xl">
        <ClientForm />
      </div>
    </div>
  )
}
