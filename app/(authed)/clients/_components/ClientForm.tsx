"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { createClientBrowser, getCurrentCompanyId } from "@/lib/supabase/client"
import { safeUpdate, safeInsert, safeUpsert } from "@/lib/supabase/safe-write"
import Link from "next/link"

export const clientSchema = z.object({
  full_name: z.string().min(2, "Full name is required"),
  company_name: z.string().optional(),
  project_name: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  tax_number: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  address: z.object({
    label: z.string().optional(),
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postal_code: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
})

export type ClientFormValues = z.infer<typeof clientSchema>

interface ClientFormProps {
  initialData?: any
  clientId?: string
  isEdit?: boolean
}

export default function ClientForm({ initialData, clientId, isEdit = false }: ClientFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [allowedGateways, setAllowedGateways] = useState<string[]>([ "stripe", "paypal", "safepay" ])
  const [activeGateways, setActiveGateways] = useState<{ gateway_name: string }[]>([])

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema) as any,
    defaultValues: initialData || {},
  })

  useEffect(() => {
    async function loadGateways() {
      try {
        const res = await fetch("/api/settings/payments").then(r => r.json()).catch(() => null)
        const settings = (res && res.settings) || {}
        const KNOWN = [ "stripe", "paypal", "safepay" ]
        const active = KNOWN.filter(
          (name) => settings[name] && settings[name].is_active === true
        )
        setActiveGateways(active.map((n: string) => ({ gateway_name: n })))

        if (isEdit && initialData?.allowed_gateways) {
          setAllowedGateways(initialData.allowed_gateways)
        } else {
          setAllowedGateways(active)
        }
      } catch { /* ignore */ }
    }
    loadGateways()
  }, [isEdit, initialData])

  useEffect(() => {
    if (initialData) {
      Object.entries(initialData).forEach(([key, value]) => {
        setValue(key as any, value)
      })
    }
  }, [initialData, setValue])

  function toggleGateway(name: string) {
    setAllowedGateways(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [ ...prev, name]
    )
  }

  async function onSubmit(values: ClientFormValues) {
    setIsLoading(true)
    try {
      const supabase = createClientBrowser()
      const companyId = await getCurrentCompanyId(supabase)
      if (!companyId) {
        toast.error("Company not found. Please complete onboarding.")
        return
      }

      const { address, ...clientFields } = values

      const payload = {
        ...clientFields,
        allowed_gateways: allowedGateways.length > 0 ? allowedGateways : null,
      }

      let result
      if (isEdit && clientId) {
        const { data, error } = await safeUpdate(supabase, "clients", payload, { id: clientId })
        if (error) throw new Error(error)
        if (!data || !data[0]) throw new Error("Client was not saved. Please refresh and try again.")
        result = data[0]
      } else {
        const { data, error } = await safeInsert(supabase, "clients", { ...payload, company_id: companyId, is_archived: false })
        if (error) throw new Error(error)
        if (!data || !data[0]) throw new Error("Client was not created. Please refresh and try again.")
        result = data[0]
      }

      if (result?.id && address && Object.values(address).some(v => v && String(v).trim() !== "")) {
        // The default client_addresses row is allowed to be absent (some
        // clients skip the address), so don't enforce expectAtLeastOne.
        const { error: addrErr } = await safeUpsert(
          supabase,
          "client_addresses",
          { client_id: result.id, ...address, is_default: true },
          { onConflict: "client_id", expectAtLeastOne: false }
        )
        if (addrErr) console.error("Address error:", addrErr)
      }

      toast.success(isEdit ? "Client updated!" : "Client created!")
      if (!isEdit) {
        window.location.href = "/clients"
      } else {
        window.location.href = `/clients/${clientId}`
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Full Name *</Label>
          <Input { ...register("full_name") } placeholder="Jane Doe" />
          {errors.full_name && <p className="text-xs text-red-500">{errors.full_name?.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Company Name</Label>
          <Input { ...register("company_name") } placeholder="Acme Corp" />
        </div>
        <div className="space-y-2">
          <Label>Project Name</Label>
          <Input { ...register("project_name") } placeholder="Website Redesign" />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input { ...register("email") } type="email" placeholder="jane@example.com" />
          {errors.email && <p className="text-xs text-red-500">{errors.email?.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input { ...register("phone") } placeholder="+1 (555) 000-0000" />
        </div>
        <div className="space-y-2">
          <Label>Website</Label>
          <Input { ...register("website") } placeholder="https://example.com" />
          {errors.website && <p className="text-xs text-red-500">{errors.website?.message}</p>}
        </div>
        <div className="space-y-2">
          <Label>Tax Number</Label>
          <Input { ...register("tax_number") } placeholder="VAT123456789" />
        </div>
        <div className="space-y-2">
          <Label>Country</Label>
          <Input { ...register("country") } placeholder="United States" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Notes</Label>
          <Input { ...register("notes") } placeholder="Additional details..." />
        </div>
      </div>
      <div className="border-t pt-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Primary Address (optional)</h3>
          <span className="text-xs text-slate-500">You can add more addresses later.</span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2"><Label>Label</Label><Input { ...register("address.label") } placeholder="e.g. Head Office" /></div>
          <div className="space-y-2 md:col-span-2"><Label>Street</Label><Input { ...register("address.street") } placeholder="2211 N First St" /></div>
          <div className="space-y-2"><Label>City</Label><Input { ...register("address.city") } placeholder="San Jose" /></div>
          <div className="space-y-2"><Label>State / Province</Label><Input { ...register("address.state") } placeholder="CA" /></div>
          <div className="space-y-2"><Label>Postal Code</Label><Input { ...register("address.postal_code") } placeholder="95131" /></div>
          <div className="space-y-2"><Label>Country</Label><Input { ...register("address.country") } placeholder="United States" /></div>
        </div>
      </div>
      <div className="border-t pt-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Allowed Payment Gateways</h3>
          <span className="text-xs text-slate-500">Untick to disable a gateway for this client.</span>
        </div>
        <div className="flex flex-wrap gap-4">
          {activeGateways.length === 0 ? (
            <p className="text-xs text-slate-500">No active gateways yet. Configure them in Settings &rarr; Payments.</p>
          ) : activeGateways.map(g => (
            <label key={g.gateway_name} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowedGateways.includes(g.gateway_name)}
                onChange={() => toggleGateway(g.gateway_name)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="capitalize">{g.gateway_name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-3 border-t pt-6">
        <Button variant="outline" asChild><Link href="/clients">Cancel</Link></Button>
        <Button type="submit" disabled={isLoading}>{isLoading ? "Saving..." : (isEdit ? "Update Client" : "Save Client")}</Button>
      </div>
    </form>
  )
}
