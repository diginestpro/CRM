"use client"

import { use, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { createClientBrowser } from "@/lib/supabase/client"
import { ArrowLeft, Save, Send } from "lucide-react"
import Link from "next/link"
import { BillingItems } from "@/components/billing/billing-items"
import { calculateInvoiceTotals } from "@/lib/invoice-calc"

const schema = z.object({
  client_id: z.string().min(1, "Client is required"),
  invoice_number: z.string().min(1, "Invoice number is required"),
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

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [clients, setClients] = useState<{ id: string; full_name: string; allowed_gateways: string[] | null }[]>([])
  const [services, setServices] = useState<{ id: string; name: string; base_price: number }[]>([])
  // Pickers
  const [clientAddresses, setClientAddresses] = useState<any[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<string>("")
  const [companyOffices, setCompanyOffices] = useState<any[]>([])
  const [selectedCompanyAddressId, setSelectedCompanyAddressId] = useState<string>("")
  const [activeGateways, setActiveGateways] = useState<{ gateway_name: string }[]>([])
  const [invoiceGateways, setInvoiceGateways] = useState<string[]>([])
  // Partial-payment controls (mirror of /invoices/new).
  const [allowsPartial, setAllowsPartial] = useState(false)
  const [minPayment, setMinPayment] = useState<string>("")

  const { register, control, watch, setValue, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: {
      items: [{ service_id: "", quantity: 1, unit_price: 0 }],
      status: "Unpaid",
      invoice_number: "",
      tax_rate: 0,
      notes: "",
    },
  })

  const selectedClientId = watch("client_id")
  const items = watch("items") || []
  const taxRate = watch("tax_rate") || 0
  const totals = calculateInvoiceTotals(items.map(i => ({
    description: i.description || "",
    quantity: i.quantity,
    unit_price: i.unit_price,
  })), taxRate)

  useEffect(() => {
    async function loadData() {
      const sb = createClientBrowser()
      const [cRes, sRes, iRes, oRes, pmRes, settingsRes] = await Promise.all([
        sb.from("clients").select("id, full_name, allowed_gateways").order("full_name"),
        sb.from("services").select("id, name, base_price").eq("is_active", true).order("name"),
        sb.from("invoices").select("*, invoice_items(*)").eq("id", id).single(),
        sb.from("company_addresses").select("id, address_name, street, city, state, postal_code, country, is_default").order("is_default", { ascending: false }),
        sb.from("invoice_payment_methods").select("payment_method").eq("invoice_id", id),
        fetch("/api/settings/payments").then(r => r.json()).catch(() => null),
      ])
      setClients((cRes.data as any) || [])
      setServices(sRes.data || [])
      setCompanyOffices((oRes.data as any[]) || [])
      if (iRes.data) {
        const inv = iRes.data
        const its = (inv.invoice_items || []).map((i: any) => ({
          service_id: i.service_id, quantity: i.quantity, unit_price: i.unit_price, description: i.description || "",
        }))
        reset({
          client_id: inv.client_id, invoice_number: inv.invoice_number, status: inv.status || "Unpaid",
          due_date: inv.due_date, tax_rate: inv.tax_rate || 0, notes: inv.notes || "",
          items: its.length > 0 ? its : [{ service_id: "", quantity: 1, unit_price: 0 }],
        })
        setSelectedCompanyAddressId(inv.company_address_id || "")
        setSelectedAddressId(inv.selected_address_id || "")
        setAllowsPartial(!!inv.allows_partial_payments)
        setMinPayment(inv.min_payment != null ? String(inv.min_payment) : "")
        setInvoiceGateways((pmRes.data || []).map((r: any) => r.payment_method))

        const settings = (settingsRes as any)?.settings || {}
        const KNOWN = ["stripe", "paypal", "safepay"]
        setActiveGateways(KNOWN.filter((n) => settings[n] && settings[n].is_active === true).map((n) => ({ gateway_name: n })))
      }
    }
    loadData()
  }, [id, reset])

  // Whenever the selected client changes, load that client's addresses.
  useEffect(() => {
    if (!selectedClientId) { setClientAddresses([]); return }
    let cancelled = false
    async function loadAddresses() {
      const sb = createClientBrowser()
      const { data: addrs } = await sb
        .from("client_addresses")
        .select("*")
        .eq("client_id", selectedClientId)
        .order("is_default", { ascending: false })
        .order("created_at")
      if (cancelled) return
      const list = (addrs as any[]) || []
      setClientAddresses(list)
      if (!selectedAddressId) {
        const def = list.find(a => a.is_default) || list[0]
        setSelectedAddressId(def?.id || "")
      }
    }
    loadAddresses()
    return () => { cancelled = true }
  }, [selectedClientId])

  async function onSubmit(status: string, sendEmail: boolean) {
    setIsLoading(true)
    try {
      const parsed = schema.safeParse(watch())
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message || "Invalid form")
        setIsLoading(false)
        return
      }
      const v = parsed.data
      const sb = createClientBrowser()
      const minPaymentNum = minPayment.trim() === "" ? null : Number(minPayment)
      const updatePayload: any = {
        client_id: v.client_id,
        invoice_number: v.invoice_number,
        status: status,
        due_date: v.due_date || null,
        tax_rate: v.tax_rate || 0,
        notes: v.notes || null,
        total_amount: totals.total,
        subtotal: totals.subtotal,
        tax_amount: totals.taxAmount,
        allows_partial_payments: allowsPartial,
        min_payment: allowsPartial ? minPaymentNum : null,
        company_address_id: selectedCompanyAddressId || null,
        selected_address_id: selectedAddressId || null,
      }
      const { error: iE } = await sb.from("invoices").update(updatePayload).eq("id", id)
      if (iE) throw iE

      // Replace invoice items.
      await sb.from("invoice_items").delete().eq("invoice_id", id)
      const { error: itemE } = await sb.from("invoice_items").insert(v.items.map(i => ({
        invoice_id: id,
        service_id: i.service_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
        description: i.description || null,
        total_amount: i.quantity * i.unit_price,
      })))
      if (itemE) throw itemE

      // Persist chosen payment gateways.
      await sb.from("invoice_payment_methods").delete().eq("invoice_id", id)
      if (invoiceGateways.length > 0) {
        await sb.from("invoice_payment_methods").insert(
          invoiceGateways.map(g => ({ invoice_id: id, payment_method: g }))
        )
      }

      if (sendEmail && status !== "Draft") {
        try { await fetch(`/api/invoices/${id}/send`, { method: "POST" }) } catch (e) { console.error("Send failed", e) }
      }

      toast.success(sendEmail ? "Invoice updated and email sent!" : `Invoice saved as ${status}`)
      router.push(`/invoices/${id}`)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || "Error")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild><Link href={`/invoices/${id}`}><ArrowLeft className="h-5 w-5" /></Link></Button>
          <div><h2 className="text-3xl font-bold">Edit Invoice</h2><p className="text-slate-500">Update the billing details.</p></div>
        </div>
      </div>
      <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
        {/* ROW 1: Client + Invoice Basics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Client</CardTitle>
              <CardDescription>Change the client for this invoice.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Select Client</Label>
                <select {...register("client_id")} className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
                  <option value="">Select a client...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
                {errors.client_id && <p className="text-xs text-red-500 mt-1">{errors.client_id.message}</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoice Basics</CardTitle>
              <CardDescription>Number, status, due date and tax rate.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Invoice Number *</Label>
                <Input {...register("invoice_number")} placeholder="INV-2026-0001" />
                {errors.invoice_number && <p className="text-xs text-red-500 mt-1">{errors.invoice_number.message}</p>}
              </div>
              <div>
                <Label>Status</Label>
                <select {...register("status")} className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm">
                  <option value="Draft">Draft</option>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Partial">Partially Paid</option>
                  <option value="Paid">Paid</option>
                  <option value="Overdue">Overdue</option>
                  <option value="Cancelled">Cancelled</option>
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
              <div className="pt-3 border-t space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 mt-0.5 rounded border-slate-300"
                    checked={allowsPartial}
                    onChange={(e) => setAllowsPartial(e.target.checked)}
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-900">Allow partial payments</div>
                    <div className="text-xs text-slate-500">
                      When off, the client must pay the full balance on the public pay page.
                    </div>
                  </div>
                </label>
                {allowsPartial && (
                  <div className="pl-6">
                    <Label className="text-xs">Minimum payment (optional)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={minPayment}
                      onChange={(e) => setMinPayment(e.target.value)}
                      placeholder="No minimum"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        {/* ROW 2: Line items */}
        <BillingItems control={control as any} setValue={setValue as any} watch={watch as any} services={services} />

        {/* ROW 3: From Address | Bill-To Address | Payment Gateways */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* From Address */}
          <Card>
            <CardHeader>
              <CardTitle>From Address</CardTitle>
              <CardDescription>Office this invoice is billed from.</CardDescription>
            </CardHeader>
            <CardContent>
              {companyOffices.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  No office addresses saved. <Link href="/settings/company" className="text-blue-600 underline">Add in Settings -&gt; Company</Link>.
                </div>
              ) : (
                <div className="space-y-2">
                  {companyOffices.map(o => {
                    const line1 = [o.street, o.city, o.state, o.postal_code, o.country].filter(Boolean).join(", ")
                    const checked = (selectedCompanyAddressId || "") === o.id
                    return (
                      <label key={o.id} className={
                        "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition " +
                        (checked ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300")
                      }>
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
                {selectedClientId ? "Pick this client's saved address." : "Pick a client above first."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedClientId ? (
                <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  Select a client to see their saved addresses.
                </div>
              ) : clientAddresses.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  No saved addresses for this client.
                </div>
              ) : (
                <div className="space-y-2">
                  {clientAddresses.map(a => {
                    const line1 = [a.street, a.city, a.state, a.postal_code, a.country].filter(Boolean).join(", ")
                    const checked = (selectedAddressId || "") === a.id
                    return (
                      <label key={a.id} className={
                        "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition " +
                        (checked ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300")
                      }>
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

          {/* Payment Gateways */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Gateways</CardTitle>
              <CardDescription>Which gateways the client can use to pay.</CardDescription>
            </CardHeader>
            <CardContent>
              {activeGateways.length === 0 ? (
                <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-medium">No active payment gateways.</p>
                  <p className="mt-1">Enable Stripe, PayPal or SafePay in <Link href="/settings/payments" className="underline font-medium">Settings -&gt; Payments</Link>.</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    {activeGateways.map(g => {
                      const name = g.gateway_name
                      const checked = invoiceGateways.includes(name)
                      return (
                        <label key={name} className={
                          "flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition " +
                          (checked ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300")
                        }>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setInvoiceGateways(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
                            }
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <span className="capitalize font-medium">{name}</span>
                        </label>
                      )
                    })}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Untick a gateway to hide it on the public pay page.</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ROW 4: Summary + Notes + Save */}
        <Card>
          <CardHeader><CardTitle>Summary &amp; Notes</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-w-xs ml-auto mb-4">
              <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><span>${totals.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Tax ({taxRate}%)</span><span>${totals.taxAmount.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t"><span>Total</span><span>${totals.total.toFixed(2)}</span></div>
            </div>
            <Label>Notes (optional)</Label>
            <textarea {...register("notes")} rows={3} placeholder="Thank you for your business!" className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" />
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3 justify-end">
          <Button type="button" variant="outline" asChild><Link href={`/invoices/${id}`}>Cancel</Link></Button>
          <Button type="button" variant="outline" onClick={() => onSubmit("Draft", false)} disabled={isLoading}>
            <Save className="h-4 w-4 mr-2" /> Save as Draft
          </Button>
          <Button type="button" variant="outline" onClick={() => onSubmit("Unpaid", false)} disabled={isLoading}>
            <Save className="h-4 w-4 mr-2" /> Save (Unpaid)
          </Button>
          <Button type="button" onClick={() => onSubmit("Unpaid", true)} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
            <Send className="h-4 w-4 mr-2" /> Save &amp; Send Email
          </Button>
        </div>
      </form>
    </div>
  )
}
