import { createClientServer } from "@/lib/supabase/server"
import ClientForm from "../../_components/ClientForm"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

// Server component: prefetch the client + addresses on the server so
// the form renders with the correct initial values (the previous
// version was accidentally marked "use client" while still declaring
// an `async` default export, which Next 16 + Turbopack refuses and
// responds with a 404).
export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClientServer()
  const { data: client, error } = await supabase
    .from("clients")
    .select("*, client_addresses(*)")
    .eq("id", id)
    .maybeSingle()

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/clients"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Edit Client</h2>
            <p className="text-red-500">{error.message}</p>
          </div>
        </div>
      </div>
    )
  }
  if (!client) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/clients"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Edit Client</h2>
            <p className="text-slate-500">Client not found.</p>
          </div>
        </div>
      </div>
    )
  }

  // Flatten addresses for the form (we only take the default one for initial data).
  const defaultAddress =
    client.client_addresses?.find((a: any) => a.is_default) || client.client_addresses?.[0] || {}
  const initialData = { ...client, address: defaultAddress }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/clients"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
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
