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
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

const clientSchema = z.object({
  full_name: z.string().min(2, "Full name is required"),
  company_name: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  tax_number: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
})

type ClientFormValues = z.infer<typeof clientSchema>

export default function NewClientPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
  })

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
      const { error } = await supabase.from("clients").insert([{ ...values, company_id, is_archived: false }])
      if (error) toast.error(error.message)
      else { toast.success("Client created!"); router.push("/clients"); router.refresh() }
    } catch (err) { toast.error("Error") }
    finally { setIsLoading(false) }
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
            <div className="space-y-2"><Label htmlFor="email">Email Address</Label><Input id="email" type="email" {...register("email")} placeholder="jane@example.com" className={errors.email ? "border-red-500" : ""} />{errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}</div>
            <div className="space-y-2"><Label htmlFor="phone">Phone Number</Label><Input id="phone" {...register("phone")} placeholder="+1 555 0000" /></div>
            <div className="space-y-2"><Label htmlFor="website">Website</Label><Input id="website" type="url" {...register("website")} placeholder="https://example.com" className={errors.website ? "border-red-500" : ""} />{errors.website && <p className="text-xs text-red-500">{errors.website.message}</p>}</div>
            <div className="space-y-2"><Label htmlFor="tax_number">Tax / VAT Number</Label><Input id="tax_number" {...register("tax_number")} placeholder="VAT123456789" /></div>
            <div className="space-y-2"><Label htmlFor="country">Country</Label><Input id="country" {...register("country")} placeholder="United States" /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="notes">Notes</Label><textarea id="notes" {...register("notes")} className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Additional details..." /></div>
          <div className="flex justify-end gap-3 border-t pt-6">
            <Button variant="outline" asChild><Link href="/clients">Cancel</Link></Button>
            <Button type="submit" disabled={isLoading}>{isLoading ? "Saving..." : "Save Client"}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
