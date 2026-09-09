"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { createClientBrowser, getCurrentCompanyId } from "@/lib/supabase/client"
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

export default function NewQuotationPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [clients, setClients] = useState<{ id: string; full_name: string }[]>([])
  const [services, setServices] = useState<{ id: string; name: string; base_price: number }[]>([])
  const [companyOffices, setCompanyOffices] = useState<any[]>([])
  const [selectedCompanyAddressId, setSelectedCompanyAddressId] = useState<string>("")

  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { items: [{ service_id: "", quantity: 1, unit_price: 0 }], status: "Draft" }
  })

  useEffect(() => {
    async function load() {
      const sb = createClientBrowser()
      const [cRes, sRes, oRes] = await Promise.all([
        sb.from("clients").select("id, full_name"),
        sb.from("services").select("id, name, base_price"),
        sb.from("company_addresses").select("id, address_name, street, city, state, postal_code, country, is_default").order("is_default", { ascending: false }).order("created_at", { ascending: true }),
      ])
      setClients(cRes.data || [])
      setServices(sRes.data || [])
      const offices = (oRes.data as any[]) || []
      setCompanyOffices(offices)
      const def = offices.find(o => o.is_default) || offices[0]
      setSelectedCompanyAddressId(def?.id || "")
    }
    load()
  }, [])

  const total = watch("items")?.reduce((a, i) => a + (i.quantity * i.unit_price), 0) || 0

  async function onSubmit(v: FormValues) {
    setIsLoading(true)
    try {
      const sb = createClientBrowser()
      const company_id = await getCurrentCompanyId(sb)
      if (!company_id) {
        toast.error("Complete onboarding first")
        router.push("/onboarding")
        return
      }
      const officeId =
        selectedCompanyAddressId ||
        (companyOffices.find(o => o.is_default)?.id || companyOffices[0]?.id || null)

      const { data: q, error: qE } = await sb.from("quotations").insert({
        company_id, client_id: v.client_id, quotation_number: v.quotation_number, status: v.status,
        issue_date: new Date().toISOString().split("T")[0], total_amount: total,
        company_address_id: officeId,
      }).select().single()
      if (qE) throw qE
      const { error: iE } = await sb.from("quotation_items").insert(v.items.map(i => ({
        quotation_id: q.id, service_id: i.service_id, quantity: i.quantity, unit_price: i.unit_price, description: i.description,
        total_amount: i.quantity * i.unit_price,
      })))
      if (iE) throw iE
      toast.success("Quotation created!")
      router.push("/quotations")
      router.refresh()
    } catch (e: any) { toast.error(e.message || "Error") }
    finally { setIsLoading(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild><Link href="/quotations"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div><h2 className="text-3xl font-bold">New Quotation</h2><p className="text-slate-500">Build a customized quote.</p></div>
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
          <div className="space-y-2 md:col-span-3">
            <Label>From Office</Label>
            {companyOffices.length === 0 ? (
              <p className="text-xs text-slate-500">
                No offices saved. <Link href="/settings/company" className="text-blue-600 underline">Add them in Settings -&gt; Company</Link>.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {companyOffices.map((o: any) => {
                  const line1 = [o.street, o.city, o.state, o.postal_code, o.country].filter(Boolean).join(", ")
                  const checked = (selectedCompanyAddressId || "") === o.id
                  return (
                    <label
                      key={o.id}
                      className={
                        "flex items-start gap-2 rounded-md border p-2 cursor-pointer transition " +
                        (checked ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300")
                      }
                    >
                      <input
                        type="radio"
                        name="selected_company_address"
                        className="mt-1"
                        checked={checked}
                        onChange={() => setSelectedCompanyAddressId(o.id)}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{o.address_name || "Office"}</span>
                          {o.is_default && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">Default</span>}
                        </div>
                        <div className="text-xs text-slate-500">{line1 || "-"}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
            <p className="text-xs text-slate-500">
              The chosen office is shown in the "From" block of this quotation, its PDF, and any email sent. The choice is per-quotation.
            </p>
          </div>
        </div>
        <BillingItems control={control as any} setValue={setValue as any} watch={watch as any} services={services} />
        <div className="flex justify-end gap-3">
          <Button variant="outline" asChild><Link href="/quotations">Cancel</Link></Button>
          <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">{isLoading ? "Saving..." : "Save Quotation"}</Button>
        </div>
      </form>
    </div>
  )
}
