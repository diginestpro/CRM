"use client"

import { useEffect, useState } from "react"
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

const clientSchema = z.object({
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

type ClientFormValues = z.infer<typeof clientSchema>

export default function NewClientPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [allowedGateways, setAllowedGateways] = useState<string[]>(["stripe", "paypal", "safepay"])
  const [activeGateways, setActiveGateways] = useState<{ gateway_name: string }[]>([])
  const { register, handleSubmit, formState: { errors } } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema) as any,
  })

  useEffect(() => {
    async function loadGateways() {
      try {
        const res = await fetch("/api/settings/payments").then(r => r.json()).catch(() => null)
        const settings = (res && res.settings) || {}
        const KNOWN = ["stripe", "paypal", "safepay"]
        const active = KNOWN.filter(
          (name) => settings[name] && settings[name].is_active === true
        )
        setActiveGateways(active.map((n: string) => ({ gateway_name: n })))
        setAllowedGateways(active)
      } catch { /* ignore */ }
    }
    loadGateways()
  }, [])

  function toggleGateway(name: string) {
    setAllowedGateways(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    )
  }

  async function onSubmit(values: ClientFormValues) {
    setIsLoading(true)
    try {
      const supabase = createClientBrowser()
      const company_id = await getCurrentCompanyId(supabase)
      if (!company_id) {
        toast.error("Complete onboarding first")
        router.push("/onboarding")
        return
      }
      const { address, ...clientFields } = values
      const { data: inserted, error } = await supabase
        .from("clients")
        .insert([
          {
            ...clientFields,
            company_id,
            is_archived: false,
            allowed_gateways: allowedGateways.length > 0 ? allowedGateways : null,
          },
        ])
        .select("id")
        .single()
      if (error) {
        toast.error(error.message)
        return
      }
      const hasAddress = address && Object.values(address).some(v => v && String(v).trim() !== "")
      if (inserted?.id && hasAddress) {
        const { error: addrErr } = await supabase.from("client_addresses").insert({
          client_id: inserted.id,
          company_id,
          label: address?.label || "Primary",
          street: address?.street || null,
          city: address?.city || null,
          state: address?.state || null,
          postal_code: address?.postal_code || null,
          country: address?.country || null,
          is_default: true,
        })
        if (addrErr) console.warn("[NewClient] address insert warning:", addrErr.message)
      }
      toast.success("Client created!")
      router.push("/clients")
      router.refresh()
    } catch (err) {
      toast.error("Error")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild><Link href="/clients"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div><h2 className="text-3xl font-bold tracking-tight text-slate-900">Add New Client</h2><p className="text-slate-500">Enter the details for your new client contact.</p></div>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-8 shadow-sm max-w-3xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="full_name">Full Name *</Label><Input id="full_name" {...register("full_name")} placeholder="Jane Doe" className={errors.full_name ? "border-red-500" : ""} />{errors.full_name && <p className="text-xs text-red-500">{errors.full_name.message}</p>}</div>
            <div className="space-y-2"><Label htmlFor="company_name">Company Name</Label><Input id="company_name" {...register("company_name")} placeholder="Acme Inc." /></div>
            <div className="space-y-2"><Label htmlFor="project_name">Project Name</Label><Input id="project_name" {...register("project_name")} placeholder="Acme Q1 Website" /></div>
            <div className="space-y-2"><Label htmlFor="email">Email Address</Label><Input id="email" type="email" {...register("email")} placeholder="jane@example.com" className={errors.email ? "border-red-500" : ""} />{errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}</div>
            <div className="space-y-2"><Label htmlFor="phone">Phone Number</Label><Input id="phone" {...register("phone")} placeholder="+1 555 0000" /></div>
            <div className="space-y-2"><Label htmlFor="website">Website</Label><Input id="website" type="url" {...register("website")} placeholder="https://example.com" className={errors.website ? "border-red-500" : ""} />{errors.website && <p className="text-xs text-red-500">{errors.website.message}</p>}</div>
            <div className="space-y-2"><Label htmlFor="tax_number">Tax / VAT Number</Label><Input id="tax_number" {...register("tax_number")} placeholder="VAT123456789" /></div>
            <div className="space-y-2"><Label htmlFor="country">Country</Label><Input id="country" {...register("country")} placeholder="United States" /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="notes">Notes</Label><textarea id="notes" {...register("notes")} className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Additional details..." /></div>

          <div className="border-t pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Primary Address (optional)</h3>
              <span className="text-xs text-slate-500">You can add more addresses later.</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2"><Label>Label</Label><Input {...register("address.label")} placeholder="e.g. Head Office" /></div>
              <div className="space-y-2 md:col-span-2"><Label>Street</Label><Input {...register("address.street")} placeholder="2211 N First St" /></div>
              <div className="space-y-2"><Label>City</Label><Input {...register("address.city")} placeholder="San Jose" /></div>
              <div className="space-y-2"><Label>State / Province</Label><Input {...register("address.state")} placeholder="CA" /></div>
              <div className="space-y-2"><Label>Postal Code</Label><Input {...register("address.postal_code")} placeholder="95131" /></div>
              <div className="space-y-2"><Label>Country</Label><Input {...register("address.country")} placeholder="United States" /></div>
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
            <Button type="submit" disabled={isLoading}>{isLoading ? "Saving..." : "Save Client"}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
