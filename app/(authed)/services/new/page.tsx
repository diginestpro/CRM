"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { createClientBrowser, getCurrentCompanyId } from "@/lib/supabase/client"
import { safeInsert } from "@/lib/supabase/safe-write"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

const serviceSchema = z.object({
  name: z.string().min(2, "Service name is required"),
  description: z.string().optional(),
  unit_price: z.number().min(0, "Price must be positive"),
  unit_type: z.string().min(1, "Unit is required"),
  is_active: z.boolean(),
})

type ServiceFormValues = z.infer<typeof serviceSchema>

export default function NewServicePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: { is_active: true, unit_type: "hour" },
  })

  async function onSubmit(values: ServiceFormValues) {
    setIsLoading(true)
    const supabase = createClientBrowser()
    const company_id = await getCurrentCompanyId(supabase)
    if (!company_id) {
      setIsLoading(false)
      toast.error("Complete onboarding first")
      router.push("/onboarding")
      return
    }
    const { error } = await safeInsert(supabase, "services", { ...values, company_id })
    setIsLoading(false)
    if (error) { toast.error(error); return }
    toast.success("Service created!")
    router.push("/services")
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild><Link href="/services"><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div><h2 className="text-3xl font-bold">Add New Service</h2><p className="text-slate-500">Define a new service for your quotations and invoices.</p></div>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-8 shadow-sm max-w-3xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Service Name *</Label>
              <Input id="name" {...register("name")} placeholder="e.g. Web Development" className={errors.name ? "border-red-500" : ""} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit_price">Unit Price *</Label>
              <Input id="unit_price" type="number" step="0.01" {...register("unit_price", { valueAsNumber: true })} placeholder="0.00" className={errors.unit_price ? "border-red-500" : ""} />
              {errors.unit_price && <p className="text-xs text-red-500">{errors.unit_price.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit_type">Unit *</Label>
              <select id="unit_type" {...register("unit_type")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="hour">Hour</option>
                <option value="day">Day</option>
                <option value="project">Project</option>
                <option value="unit">Unit</option>
                <option value="month">Month</option>
              </select>
              {errors.unit_type && <p className="text-xs text-red-500">{errors.unit_type.message}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea id="description" {...register("description")} className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Describe what this service includes..." />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_active" {...register("is_active")} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <Label htmlFor="is_active" className="text-sm font-medium text-slate-700">Active Service</Label>
          </div>
          <div className="flex justify-end gap-3 border-t pt-6">
            <Button variant="outline" asChild><Link href="/services">Cancel</Link></Button>
            <Button type="submit" disabled={isLoading}>{isLoading ? "Saving..." : "Save Service"}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
