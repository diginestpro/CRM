import { createClientServer } from "@/lib/supabase/server"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search, Mail, Phone, MapPin, Users as UsersIcon } from "lucide-react"
import Link from "next/link"
import { ClientRowActions } from "@/components/billing/client-row-actions"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/ui/empty-state"

export default async function ClientsPage() {
  const supabase = await createClientServer()
  const { data: clients, error } = await supabase
    .from("clients")
    .select("*, client_addresses(id, is_default)")
    .order("created_at", { ascending: false })
  if (error) return <div className="p-6 text-red-500">Error loading clients: {error.message}</div>

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Manage your client relationships and contact information."
        actions={
          <Link href="/clients/new" className="h-10 px-4 rounded-xl bg-brand-gradient text-white text-sm font-medium shadow-lg shadow-indigo-500/25 hover:opacity-90 transition-opacity inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Client
          </Link>
        }
      />
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <Input placeholder="Search clients..." className="pl-9 h-10 bg-white border-slate-200 rounded-xl" />
        </div>
      </div>
      {clients && clients.length > 0 ? (
      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
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
      ) : (
        <EmptyState
          icon={UsersIcon}
          title="No clients yet"
          description="Add your first client to start invoicing and tracking payments."
          actionLabel="Add Client"
          actionHref="/clients/new"
        />
      )}
    </div>
  )
}
