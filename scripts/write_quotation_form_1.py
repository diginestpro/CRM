import os

def write_file(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

# Split content to avoid editor limit
CONTENT_PART1 = r'''"use client"

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
import { BillingItems } from "@/components/billing/billing-items"

const schema = z.object({
  client_id: z.string().min(1, "Required"),
  quotation_number: z.string().min(1, "Required"),
  status: z.string(),
  items: z.array(z.object({
    service_id: z.string().min(1, "Required"),
    quantity: z.coerce.number().min(1),
    unit_price: z.coerce.number().min(0),
    description: z.string().optional(),
  })).min(1, "Add at least one item"),
})

type FormValues = z.infer<typeof schema>

interface QuotationFormProps {
  initialData?: any
  quotationId?: string
  isEdit?: boolean
}

export default function QuotationForm({ initialData, quotationId, isEdit = false }: QuotationFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [clients, setClients] = useState<{ id: string; full_name: string }[]>([])
  const [services, setServices] = useState<{ id: string; name: string; base_price: number }[]>([])
  const [companyOffices, setCompanyOffices] = useState<any[]>([])
  const [selectedCompanyAddressId, setSelectedCompanyAddressId] = useState<string>("")

  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initialData || { items: [{ service_id: "", quantity: 1, unit_price: 0 }], status: "Draft" }
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
      if (initialData?.company_address_id) {
        setSelectedCompanyAddressId(initialData.company_address_id)
      } else {
        const def = offices.find(o => o.is_default) || offices[0]
        setSelectedCompanyAddressId(def?.id || "")
      }
    }
    load()
  }, [initialData])

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
      const officeId = selectedCompanyAddressId || (companyOffices.find(o => o.is_default)?.id || companyOffices[0]?.id || null)

      let qId = quotationId

      if (isEdit && quotationId) {
        const { error } = await sb.from("quotations").update({
          client_id: v.client_id, quotation_number: v.quotation_number, status: v.status,
          total_amount: total, company_address_id: officeId,
        }).eq("id", quotationId)
        if (error) throw error
      } else {
        const { data, error } = await sb.from("quotations").insert({
          company_id, client_id: v.client_id, quotation_number: v.quotation_number, status: v.status,
          issue_date: new Date().toISOString().split("T")[0], total_amount: total,
          company_address_id: officeId,
        }).select().single()
        if (error) throw error
        qId = data.id
      }

      const itemsPayload = v.items.map(i => ({
        quotation_id: qId, service_id: i.service_id, quantity: i.quantity, unit_price: i.unit_price, description: i.description,
      }))

      if (isEdit) {
        await sb.from("quotation_items").delete().eq("quotation_id", qId)
      }
      const { error: iE } = await sb.from("quotation_items").insert(itemsPayload)
      if (iE) throw iE

      toast.success(isEdit ? "Quotation updated!" : "Quotation created!")
      router.push(`/quotations/${qId}`)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || "Error")
    } finally {
      setIsLoading(false)
    }
  }
'''
