"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { createClientBrowser, getCurrentCompanyId } from "@/lib/supabase/client"
import { ArrowLeft, Plus, Send, Save, Trash2, UserPlus, RefreshCw } from "lucide-react"
import Link from "next/link"
import { BillingItems } from "@/components/billing/billing-items"
import { calculateInvoiceTotals } from "@/lib/invoice-calc"

const schema = z.object({
  client_id: z.string().min(1, "Please select a client"),
  invoice_number: z.string().min(1, "Invoice number required"),
  status: z.string(),
  due_date: z.string().optional(),
  tax_rate: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().optional(),
  items: z.array(z.object({
    service_id: z.string().min(1, "Required"),
    quantity: z.coerce.number().min(1),
    unit_price: z.coerce.number().min(0),
    description: z.string().optional(),
  })).min(1, "Add at least one item"),
})

type FormValues = z.infer<typeof schema>

export default function NewInvoicePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [clients, setClients] = useState<{ id: string; full_name: string; email: string | null }[]>([])
  const [services, setServices] = useState<{ id: string; name: string; base_price: number }[]>([])
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClient, setNewClient] = useState({ full_name: "", email: "", phone: "" })
  const [creatingClient, setCreatingClient] = useState(false)

  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      items: [{ service_id: "", quantity: 1, unit_price: 0 }],
      status: "Unpaid",
      invoice_number: "",
      tax_rate: 0,
      notes: "",
    }
  })

  const items = watch("items") || []
  const taxRate = watch("tax_rate") || 0
  const totals = calculateInvoiceTotals(items.map(i => ({
    description: i.description || "",
    quantity: i.quantity,
    unit_price: i.unit_price,
  })), taxRate)

  // Fetch next invoice number on mount
  useEffect(() => {
    async function loadAll() {
      const sb = createClientBrowser()
      const [c, s, next] = await Promise.all([
        sb.from("clients").select("id, full_name, email").order("full_name"),
        sb.from("services").select("id, name, base_price").eq("is_active", true).order("name"),
        fetch("/api/invoices/next-number").then(r => r.json()).catch(() => null),
      ])
      setClients(c.data || [])
      setServices(s.data || [])
      if (next?.success && next.number) {
        setValue("invoice_number", next.number)
      } else {
        // Fallback to timestamp-based number
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")
        setValue("invoice_number", `INV-${stamp}-001`)
      }
    }
    loadAll()
  }, [setValue])

  async function refreshInvoiceNumber() {
    const res = await fetch("/api/invoices/next-number").then(r => r.json())
    if (res?.success) setValue("invoice_number", res.number)
  }

  async function handleCreateClient() {
    if (!newClient.full_name.trim()) {
      toast.error("Client name is required")
      return
    }
    setCreatingClient(true)
    try {
      const sb = createClientBrowser()
      const company_id = await getCurrentCompanyId(sb)
      if (!company_id) {
        toast.error("Complete onboarding first")
        router.push("/onboarding")
        return
      }
      const { data, error } = await sb.from("clients").insert([{
        company_id,
        full_name: newClient.full_name.trim(),
        email: newClient.email.trim() || null,
        phone: newClient.phone.trim() || null,
      }]).select("id, full_name, email").single()
      if (error) throw error
      setClients(prev => [...prev, data])
      setValue("client_id", data.id)
      setShowNewClient(false)
      setNewClient({ full_name: "", email: "", phone: "" })
      toast.success("Client created and selected")
    } catch (e: any) {
      toast.error(e.message || "Failed to create client")
    } finally {
      setCreatingClient(false)
    }
  }

  async function onSubmit(status: string, sendEmail: boolean) {
    setIsLoading(true)
    try {
      const v = watch()
      // Validate
      const parsed = schema.safeParse(v)
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message || "Invalid form")
        setIsLoading(false)
        return
      }
      const data = parsed.data

      const sb = createClientBrowser()
      const company_id = await getCurrentCompanyId(sb)
      if (!company_id) {
        toast.error("Complete onboarding first")
        router.push("/onboarding")
        return
      }

      const due_date = data.due_date || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

      const { data: inv, error: invE } = await sb.from("invoices").insert({
        company_id,
        client_id: data.client_id,
        invoice_number: data.invoice_number,
        status: status,
        issue_date: new Date().toISOString().split("T")[0],
        due_date,
        subtotal: totals.subtotal,
        tax_amount: totals.taxAmount,
        tax_rate: data.tax_rate || 0,
        total_amount: totals.total,
        amount_paid: 0,
        notes: data.notes || null,
      }).select().single()
      if (invE) throw invE

      const { error: iE } = await sb.from("invoice_items").insert(data.items.map(i => ({
        invoice_id: inv.id,
        service_id: i.service_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
        description: i.description,
        total_amount: i.quantity * i.unit_price,
      })))
      if (iE) throw iE

      // Optionally send email
      if (sendEmail && status !== "Draft") {
        try {
          await fetch(`/api/invoices/${inv.id}/send`, { method: "POST" })
        } catch (e) {
          console.error("Send failed", e)
        }
      }

      toast.success(sendEmail ? "Invoice created and email sent!" : `Invoice saved as ${status}`)
      router.push(`/invoices/${inv.id}`)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || "Error")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/invoices" className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-2">
            <ArrowLeft className="h-3 w-3" /> Back to Invoices
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">New Invoice</h1>
        </div>
      </div>

      <form onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Client</CardTitle>
              <CardDescription>Select an existing client or create a new one.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!showNewClient ? (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label>Select Client</Label>
                    <select {...register("client_id")} className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
                      <option value="">Select a client...</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.full_name}{c.email ? ` (${c.email})` : ""}</option>
                      ))}
                    </select>
                    {errors.client_id && <p className="text-xs text-red-500 mt-1">{errors.client_id.message}</p>}
                  </div>
                  <Button type="button" variant="outline" onClick={() => setShowNewClient(true)} className="mt-6">
                    <UserPlus className="h-4 w-4 mr-1" /> New
                  </Button>
                </div>
              ) : (
                <div className="border rounded-lg p-4 bg-slate-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Create New Client</p>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewClient(false)}>Cancel</Button>
                  </div>
                  <div>
                    <Label>Full Name *</Label>
                    <Input value={newClient.full_name} onChange={(e) => setNewClient({ ...newClient, full_name: e.target.value })} placeholder="John Doe" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Email</Label>
                      <Input type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} placeholder="john@example.com" />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} placeholder="+1 555 0100" />
                    </div>
                  </div>
                  <Button type="button" onClick={handleCreateClient} disabled={creatingClient} size="sm">
                    {creatingClient ? <span>Creating...</span> : <><Plus className="h-3 w-3 mr-1" /> Create Client</>}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Invoice Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Invoice Number *</Label>
                <div className="flex gap-2">
                  <Input {...register("invoice_number")} placeholder="INV-2026-0001" />
                  <Button type="button" variant="outline" size="icon" onClick={refreshInvoiceNumber} title="Auto-generate">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                {errors.invoice_number && <p className="text-xs text-red-500 mt-1">{errors.invoice_number.message}</p>}
              </div>
              <div>
                <Label>Status</Label>
                <select {...register("status")} className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
                  <option value="Draft">Draft</option>
                  <option value="Unpaid">Unpaid (Send to client)</option>
                </select>
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" {...register("due_date")} />
              </div>
              <div>
                <Label>Tax Rate (%)</Label>
                <Input type="number" step="0.01" min="0" max="100" {...register("tax_rate")} placeholder="0" />
                <p className="text-xs text-slate-500 mt-1">Applied to invoice subtotal</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <BillingItems register={register} control={control} setValue={setValue} watch={watch} services={services} errors={errors} />

        <Card className="mt-6">
          <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-w-xs ml-auto">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><span>${totals.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Tax ({taxRate}%)</span><span>${totals.taxAmount.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t"><span>Total</span><span>${totals.total.toFixed(2)}</span></div>
            </div>
            <div className="mt-4">
              <Label>Notes (optional)</Label>
              <textarea {...register("notes")} rows={2} placeholder="Thank you for your business!" className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" />
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex flex-wrap gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => onSubmit("Draft", false)} disabled={isLoading}>
            <Save className="h-4 w-4 mr-2" /> Save as Draft
          </Button>
          <Button type="button" variant="outline" onClick={() => onSubmit("Unpaid", false)} disabled={isLoading}>
            <Save className="h-4 w-4 mr-2" /> Save (Unpaid)
          </Button>
          <Button type="button" onClick={() => onSubmit("Unpaid", true)} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
            <Send className="h-4 w-4 mr-2" /> Save & Send Email
          </Button>
        </div>
      </form>
    </div>
  )
}
