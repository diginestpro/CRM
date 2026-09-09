import os

def write_file(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

new_client_page = r'''"use client"

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
'''

edit_client_page = r'''"use client"

import { use, useState } from "react"
import { useRouter } from "next/navigation"
import ClientForm from "../../_components/ClientForm"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { createClientBrowser } from "@/lib/supabase/client"

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  // We fetch the initial data here to pass it to the ClientForm
  const supabase = createClientBrowser()
  const { data: client, error } = await supabase.from("clients").select("*, client_addresses(*)").eq("id", id).single()
  
  if (error || !client) {
    return <div className="p-6 text-center">Error loading client details.</div>
  }

  // Flatten addresses for the form (we only take the default one for initial data)
  const defaultAddress = client.client_addresses?.find((a: any) => a.is_default) || client.client_addresses?.[0] || {}
  const initialData = { ...client, address: defaultAddress }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild><Link href="/clients"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Edit Client</h2>
            <p className="text-slate-500">Update the information for this client contact.</p>
          </div>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-8 shadow-sm max-w-3xl">
        <ClientForm initialData={initialData} clientId={id} isEdit={true} />
      </div>
    </div>
  )
}
'''

write_file(r"C:\Users\LENOVO\Desktop\CRM\app\(authed)\clients\new\page.tsx", new_client_page)
write_file(r"C:\Users\LENOVO\Desktop\CRM\app\(authed)\clients\[id]\edit\page.tsx", edit_client_page)
