import { createClientServer } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Search, Package } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { ServiceRowActions } from "@/components/billing/service-row-actions"

export default async function ServicesPage() {
  const supabase = await createClientServer()
  const { data: services, error } = await supabase.from("services").select("*").order("name", { ascending: true })
  if (error) return <div className="p-6 text-red-500">Error loading services: {error.message}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Services</h2>
          <p className="text-slate-500">Manage your service catalog and pricing.</p>
        </div>
        <Button asChild><Link href="/services/new" className="flex items-center gap-2"><Plus className="h-4 w-4" /> Add Service</Link></Button>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search services..." className="pl-9" />
        </div>
      </div>
      <div className="rounded-xl border bg-white shadow-sm">
        <Table>
          <TableHeader><TableRow><TableHead>Service Name</TableHead><TableHead>Description</TableHead><TableHead>Unit</TableHead><TableHead>Base Price</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {services && services.length > 0 ? services.map((service) => (
              <TableRow key={service.id}>
                <TableCell className="font-medium text-slate-900"><div className="flex items-center gap-2"><Package className="h-4 w-4 text-slate-400" />{service.name}</div></TableCell>
                <TableCell className="text-slate-600 max-w-xs truncate">{service.description || "-"}</TableCell>
                <TableCell className="text-slate-600 capitalize">{service.unit_type || "fixed"}</TableCell>
                <TableCell className="font-medium text-slate-900">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(service.base_price)}</TableCell>
                <TableCell><span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", service.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600")}>{service.is_active ? "Active" : "Inactive"}</span></TableCell>
                <TableCell className="text-right"><ServiceRowActions serviceId={service.id} /></TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={6} className="h-32 text-center text-slate-500">No services found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
