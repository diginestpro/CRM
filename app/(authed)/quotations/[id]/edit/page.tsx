"use client"

import { use, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { createClientBrowser } from "@/lib/supabase/client"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { BillingItems } from "@/components/billing/billing-items"

const schema = z.object({
  client_id: z.string().min(1, "Required"),
  quotation_number: z.string().min(1, "Required"),
  status: z.string(),
  items: z.array(z.object({
    service_id: z.string().min(1, "Required"),
    quantity: z.number().min(1),
    unit_price: z.number().min(0),
    description: z.string().optional(),
  })).min(1, "Add at least one item"),
})

type FormValues = z.infer<typeof schema>

export default function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [clients, setClients] = useState<{ id: string; full_name: string }[]>([])
  const [services, setServices] = useState<{ id: string; name: string; base_price: number }[]>([])

  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    async function loadData() {
      const sb = createClientBrowser()
      const [cRes, sRes, qRes] = await Promise.all([
        sb.from("clients").select("id, full_name"),
        sb.from("services").select("id, name, base_price"),
        sb.from("quotations").select("*, quotation_items(*)").eq("id", id).single()
      ])
      setClients(cRes.data || [])
      setServices(sRes.data || [])
      if (qRes.data) {
        const items = (qRes.data.quotation_items || []).map((i: any) => ({
          service_id: i.service_id, quantity: i.quantity, unit_price: i.unit_price, description: i.description,
        }))
        reset({
          client_id: qRes.data.client_id, quotation_number: qRes.data.quotation_number, status: qRes.data.status,
          items: items.length > 0 ? items : [{ service_id: "", quantity: 1, unit_price: 0 }],
        })
      }
    }
    loadData()
  }, [id, reset])

  const total = watch("items")?.reduce((a, i) => a + (i.quantity * i.unit_price), 0) || 0

  async function onSubmit(v: FormValues) {
    setIsLoading(true)
    try {
      const sb = createClientBrowser()
      const { error: qE } = await sb.from("quotations").update({
        client_id: v.client_id, quotation_number: v.quotation_number, status: v.status, total_amount: total,
      }).eq("id", id)
      if (qE) throw qE
      await sb.from("quotation_items").delete().eq("quotation_id", id)
      const { error: iE } = await sb.from("quotation_items").insert(v.items.map(i => ({
        quotation_id: id, service_id: i.service_id, quantity: i.quantity, unit_price: i.unit_price, description: i.description,
        total_amount: i.quantity * i.unit_price,
      })))
      if (iE) throw iE
      toast.success("Quotation updated!")
      router.push(`/quotations/${id}`)
      router.refresh()
    } catch (e: any) { toast.error(e.message || "Error") }
    finally { setIsLoading(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild><Link href={`/quotations/${id}`}><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div><h2 className="text-3xl font-bold">Edit Quotation</h2><p className="text-slate-500">Update the details of this quote.</p></div>
        </div>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 rounded-xl border bg-white p-6 shadow-sm">
          <div className="space-y-2">
            <Label>Client *</Label>
            <select {...register("client_id")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Select Client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
            {errors.client_id && <p className="text-xs text-red-500">{errors.client_id.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Quote Number *</Label>
            <Input {...register("quotation_number")} placeholder="QT-2024-001" />
            {errors.quotation_number && <p className="text-xs text-red-500">{errors.quotation_number.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <select {...register("status")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="Draft">Draft</option><option value="Sent">Sent</option><option value="Accepted">Accepted</option><option value="Rejected">Rejected</option>
            </select>
          </div>
        </div>
        <BillingItems control={control as any} setValue={setValue as any} watch={watch as any} services={services} />
        <div className="flex justify-end gap-3">
          <Button variant="outline" asChild><Link href={`/quotations/${id}`}>Cancel</Link></Button>
          <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">{isLoading ? "Saving..." : "Save Changes"}</Button>
        </div>
      </form>
    </div>
  )
}
