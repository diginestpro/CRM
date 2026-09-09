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
  const [clients, setClients] = useState<{ id: string; full_name: string; email: string | null; allowed_gateways: string[] | null }[]>([])
  const [services, setServices] = useState<{ id: string; name: string; base_price: number }[]>([])
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClient, setNewClient] = useState({ full_name: "", email: "", phone: "" })
  const [creatingClient, setCreatingClient] = useState(false)
  const [clientAddresses, setClientAddresses] = useState<{ id: string; label: string | null; street: string | null; city: string | null; state: string | null; postal_code: string | null; country: string | null; is_default: boolean }[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<string>("")
  const [activeGateways, setActiveGateways] = useState<{ gateway_name: string }[]>([])
  const [invoiceGateways, setInvoiceGateways] = useState<string[]>([])
  // Per-invoice "From" office picker (USA / PK / UAE / ...). The choice
  // is independent per invoice - picking USA on invoice #1 will NOT
  // affect invoice #2.
  const [companyOffices, setCompanyOffices] = useState<any[]>([])
  const [selectedCompanyAddressId, setSelectedCompanyAddressId] = useState<string>("")

  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      items: [{ service_id: "", quantity: 1, unit_price: 0 }],
      status: "Unpaid",
      invoice_number: "",
      tax_rate: 0,
      notes: "",
    }
  })

  const selectedClientId = watch("client_id")

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
        sb.from("clients").select("id, full_name, email, allowed_gateways").order("full_name"),
        sb.from("services").select("id, name, base_price").eq("is_active", true).order("name"),
        fetch("/api/invoices/next-number").then(r => r.json()).catch(() => null),
      ])
      setClients(((c.data as any) || []).map((row: any) => ({
        id: row.id,
        full_name: row.full_name,
        email: row.email ?? null,
        allowed_gateways: row.allowed_gateways ?? null,
      })))
      setServices(s.data || [])
      if (next?.success && next.number) {
        setValue("invoice_number", next.number)
      } else {
        // Fallback to timestamp-based number
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")
        setValue("invoice_number", `INV-${stamp}-001`)
      }

      // Load active company payment gateways once
      try {
        const res = await fetch("/api/settings/payments").then(r => r.json()).catch(() => null)
        const list: any[] = res?.gateways || []
        setActiveGateways(list.filter((g: any) => g.is_active).map((g: any) => ({ gateway_name: g.gateway_name })))
      } catch { /* ignore */ }

      // Load the company's office addresses (USA / PK / UAE / ...) so the
      // user can pick which office this invoice is billed FROM. The choice
      // is per-invoice.
      try {
        const sb = createClientBrowser()
        const { data: offices } = await sb
          .from("company_addresses")
          .select("id, address_name, street, city, state, postal_code, country, is_default")
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: true })
        const list = (offices as any[]) || []
        setCompanyOffices(list)
        const def = list.find(o => o.is_default) || list[0]
        setSelectedCompanyAddressId(def?.id || "")
      } catch { /* ignore */ }
    }
    loadAll()
  }, [setValue])

  // Whenever the selected client changes, fetch that client's addresses and
  // pre-select the default one. Also restrict the gateway picker to the
  // client's allowed_gateways (or all active ones if the client has none set).
  useEffect(() => {
    if (!selectedClientId) {
      setClientAddresses([])
      setSelectedAddressId("")
      setInvoiceGateways([])
      return
    }
    let cancelled = false
    async function loadAddresses() {
      const sb = createClientBrowser()
      const [{ data: addrs }, { data: cli }] = await Promise.all([
        sb.from("client_addresses").select("*").eq("client_id", selectedClientId).order("is_default", { ascending: false }).order("created_at"),
        sb.from("clients").select("allowed_gateways").eq("id", selectedClientId).maybeSingle(),
      ])
      if (cancelled) return
      const list = (addrs as any[]) || []
      setClientAddresses(list)
      const def = list.find(a => a.is_default) || list[0]
      setSelectedAddressId(def?.id || "")

      // Compose the invoice gateway choices
      const allowed: string[] | null = (cli as any)?.allowed_gateways || null
      const activeNames = activeGateways.map(g => g.gateway_name)
      const choices = allowed && allowed.length > 0 ? allowed : activeNames
      setInvoiceGateways(choices)
    }
    loadAddresses()
    return () => { cancelled = true }
  }, [selectedClientId, activeGateways])

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
      setClients(prev => [
        ...prev,
        {
          id: data.id,
          full_name: data.full_name,
          email: data.email ?? null,
          allowed_gateways: (data as any).allowed_gateways ?? null,
        },
      ])
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

      // Persist the selected Bill-To address on the invoice row, if any.
      if (selectedAddressId) {
        await sb.from("invoices").update({ selected_address_id: selectedAddressId }).eq("id", inv.id)
      }

      // Persist the chosen From-office (company_address_id). If none was
      // picked we fall back to the company's default office so the field
      // is never null on new invoices.
      const officeId =
        selectedCompanyAddressId ||
        (companyOffices.find(o => o.is_default)?.id || companyOffices[0]?.id || null)
      if (officeId) {
        await sb.from("invoices").update({ company_address_id: officeId }).eq("id", inv.id)
      }

      // Persist the chosen payment gateways for this invoice.
      // Replace any prior entries so the user always sees what they picked last.
      await sb.from("invoice_payment_methods").delete().eq("invoice_id", inv.id)
      if (invoiceGateways.length > 0) {
        const { error: pmE } = await sb.from("invoice_payment_methods").insert(
          invoiceGateways.map(g => ({
            invoice_id: inv.id,
            company_id,
            payment_method: g,
          }))
        )
        if (pmE) console.warn("[onSubmit] invoice_payment_methods insert warning:", pmE.message)
      }

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
        {/* ROW 1: Client (left) + Invoice Basics (right).
              Basics visible immediately so the user can fill in
              number/date/tax without scrolling past picker cards. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <Card className="lg:col-span-2">
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

          {/* Invoice Basics - always visible at the top right so the
              user can see / change number, status, due date, tax. */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Basics</CardTitle>
              <CardDescription>Number, status, due date and tax rate.</CardDescription>
            </CardHeader>
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

        {/* ROW 2: Line items (BillingItems) */}
        <BillingItems control={control} setValue={setValue} watch={watch} services={services} />

        {/* ROW 3: Three compact pickers side-by-side:
              From Address | Bill-To Address | Payment Gateways.
              All always visible (gateways show a friendly nudge if
              none are configured). */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          {/* From Address */}
          <Card>
            <CardHeader>
              <CardTitle>From Address</CardTitle>
              <CardDescription>
                Pick the office this invoice is billed from. The choice is
                saved on this invoice only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {companyOffices.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  No office addresses saved yet. Add them in{" "}
                  <Link href="/settings/company" className="text-blue-600 underline">
                    Settings &amp; Company
                  </Link>
                  .
                </div>
              ) : (
                <div className="space-y-2">
                  {companyOffices.map(o => {
                    const line1 = [o.street, o.city, o.state, o.postal_code, o.country].filter(Boolean).join(", ")
                    const checked = (selectedCompanyAddressId || "") === o.id
                    return (
                      <label
                        key={o.id}
                        className={
                          "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition " +
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
                            {o.is_default && <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">Default</span>}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{line1 || "-"}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bill-To Address */}
          <Card>
            <CardHeader>
              <CardTitle>Bill-To Address</CardTitle>
              <CardDescription>
                {selectedClientId
                  ? "Pick this client's saved address for the invoice."
                  : "Pick a client above to load their addresses."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedClientId ? (
                <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  Select a client above to see their saved addresses.
                </div>
              ) : clientAddresses.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  No saved addresses yet for this client. The primary email/country will be used instead.
                </div>
              ) : (
                <div className="space-y-2">
                  {clientAddresses.map(a => {
                    const line1 = [a.street, a.city, a.state, a.postal_code, a.country].filter(Boolean).join(", ")
                    const checked = (selectedAddressId || "") === a.id
                    return (
                      <label
                        key={a.id}
                        className={
                          "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition " +
                          (checked ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300")
                        }
                      >
                        <input
                          type="radio"
                          name="selected_address"
                          className="mt-1"
                          checked={checked}
                          onChange={() => setSelectedAddressId(a.id)}
                          />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{a.label || "Address"}</span>
                            {a.is_default && <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">Default</span>}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{line1 || "-"}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Gateways - ALWAYS visible. If no gateways are
              configured for this company, we show an inline nudge so the
              user can enable one in Settings -> Payments. */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Gateways</CardTitle>
              <CardDescription>
                Which gateways can the client use to pay this invoice?
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeGateways.length === 0 ? (
                <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-medium">No active payment gateways.</p>
                  <p className="mt-1">
                    Enable Stripe, PayPal or SafePay in{" "}
                    <Link href="/settings/payments" className="underline font-medium">
                      Settings &rarr; Payments
                    </Link>{" "}
                    so the client can pay this invoice.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    {activeGateways.map(g => {
                      const name = g.gateway_name
                      const checked = invoiceGateways.includes(name)
                      return (
                        <label
                          key={name}
                          className={
                            "flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition " +
                            (checked
                              ? "border-blue-500 bg-blue-50"
                              : "border-slate-200 hover:border-slate-300")
                          }
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setInvoiceGateways(prev =>
                                prev.includes(name)
                                  ? prev.filter(n => n !== name)
                                  : [...prev, name]
                              )
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span className="capitalize font-medium">{name}</span>
                        </label>
                      )
                    })}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Untick a gateway to hide it on the public payment page for this invoice.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

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
