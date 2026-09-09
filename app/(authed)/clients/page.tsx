import { createClientServer } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search, Mail, Phone, MapPin } from "lucide-react"
import Link from "next/link"
import { ClientRowActions } from "@/components/billing/client-row-actions"

export default async function ClientsPage() {
  const supabase = await createClientServer()
  // Pull clients + count of addresses per client (cheap aggregate)
  const { data: clients, error } = await supabase
    .from("clients")
    .select("*, client_addresses(id, is_default)")
    .order("created_at", { ascending: false })
  if (error) return <div className="p-6 text-red-500">Error loading clients: {error.message}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Clients</h2>
          <p className="text-slate-500">Manage your client relationships and contact information.</p>
        </div>
        <Button asChild><Link href="/clients/new" className="flex items-center gap-2"><Plus className="h-4 w-4" /> Add Client</Link></Button>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search clients..." className="pl-9" />
        </div>
      </div>
      <div className="rounded-xl border bg-white shadow-sm">
        <Table>
          <TableHeader><TableRow><TableHead>Client Name</TableHead><TableHead>Company</TableHead><TableHead>Contact</TableHead><TableHead>Location</TableHead><TableHead>Addresses</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {clients && clients.length > 0 ? clients.map((client: any) => {
              const addrs = client.client_addresses || []
              const defaultAddr = addrs.find((a: any) => a.is_default) || addrs[0]
              return (
                <TableRow key={client.id}>
                  <TableCell className="font-medium text-slate-900">{client.full_name}</TableCell>
                  <TableCell className="text-slate-600">{client.company_name || "-"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1 text-xs text-slate-500"><Mail className="h-3 w-3" />{client.email || "-"}</div>
                      <div className="flex items-center gap-1 text-xs text-slate-500"><Phone className="h-3 w-3" />{client.phone || "-"}</div>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600">{client.country || "-"}</TableCell>
                  <TableCell>
                    {addrs.length === 0 ? (
                      <span className="text-xs text-slate-400">None</span>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-slate-600">
                        <MapPin className="h-3 w-3" />
                        <span>{addrs.length} saved</span>
                        {defaultAddr && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">default</span>}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right"><ClientRowActions clientId={client.id} email={client.email} /></TableCell>
                </TableRow>
              )
            }) : (
              <TableRow><TableCell colSpan={6} className="h-32 text-center text-slate-500">No clients found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
