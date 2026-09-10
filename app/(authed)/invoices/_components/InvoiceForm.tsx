"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { createClientBrowser, getCurrentCompanyId } from "@/lib/supabase/client"
import { safeUpdate, safeInsert, safeDelete } from "@/lib/supabase/safe-write"
import { Save, Send } from "lucide-react"
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

interface InvoiceFormProps {
  initialData?: any
  invoiceId?: string
  isEdit?: boolean
}

export default function InvoiceForm({ initialData, invoiceId, isEdit = false }: InvoiceFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [clients, setClients] = useState<{ id: string; full_name: string; email: string | null; allowed_gateways: string[] | null }[]>([])
  const [services, setServices] = useState<{ id: string; name: string; base_price: number }[]>([])
  const [companyOffices, setCompanyOffices] = useState<any[]>([])
  const [selectedCompanyAddressId, setSelectedCompanyAddressId] = useState<string>("")
  const [activeGateways, setActiveGateways] = useState<{ gateway_name: string }[]>([])
  const [invoiceGateways, setInvoiceGateways] = useState<string[]>([])
  const [allowsPartial, setAllowsPartial] = useState(false)
  const [minPayment, setMinPayment] = useState<string>("")

  const { register, control, watch, setValue, handleSubmit, formState: { errors }, getValues } = useForm<FormValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: initialData || {
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

  useEffect(() => {
    async function loadData() {
      const sb = createClientBrowser()
      const [cRes, sRes, oRes, settingsRes] = await Promise.all([
        sb.from("clients").select("id, full_name, email, allowed_gateways").order("full_name"),
        sb.from("services").select("id, name, base_price").eq("is_active", true).order("name"),
        sb.from("company_addresses").select("id, address_name, street, city, state, postal_code, country, is_default").order("is_default", { ascending: false }).order("created_at", { ascending: true }),
        fetch("/api/settings/payments").then(r => r.json()).catch(() => null)
      ])
      setClients(cRes.data || [])
      setServices(sRes.data || [])
      const offices = oRes.data || []
      setCompanyOffices(offices)

      const settings = (settingsRes && settingsRes.settings) || {}
      const KNOWN = [ "stripe", "paypal", "safepay" ]
      const active = KNOWN.filter(
        (name) => settings[name] && settings[name].is_active === true
      )
      setActiveGateways(active.map((n: string) => ({ gateway_name: n })))

      const defaultOffice = offices.find((o: any) => o.is_default)
      if (defaultOffice) {
        setSelectedCompanyAddressId(defaultOffice.id)
      }

      // Auto-fill the invoice number for NEW invoices using the
      // company's running sequence (INV-{YEAR}-{SEQ}). We only set this
      // on create (no initialData) so existing invoice numbers stay
      // intact when editing.
      if (!initialData) {
        try {
          const numRes = await fetch("/api/invoices/next-number")
          if (numRes.ok) {
            const numData = await numRes.json()
            if (numData?.success && numData?.number) {
              setValue("invoice_number", numData.number)
            }
          }
        } catch {
          // Non-fatal: user can still type the invoice number manually.
        }
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    if (initialData) {
      Object.entries(initialData).forEach(([key, value]) => {
        setValue(key as any, value)
      })
      if (initialData.company_address_id) {
        setSelectedCompanyAddressId(initialData.company_address_id)
      }
      // Read the per-invoice gateways from invoice_payment_methods
      // (the form's load helper passes them through as `payment_methods`).
      const seedGateways: string[] | undefined =
        (initialData as any).payment_methods ||
        (initialData as any).allowed_gateways ||
        undefined
      if (seedGateways && seedGateways.length > 0) {
        setInvoiceGateways(seedGateways)
      }
      // Column names are plural on the invoices table.
      if (initialData.allows_partial_payments !== undefined) {
        setAllowsPartial(!!initialData.allows_partial_payments)
      } else if (initialData.allows_partial_payment !== undefined) {
        setAllowsPartial(!!initialData.allows_partial_payment)
      }
      if (initialData.min_payment !== undefined && initialData.min_payment !== null) {
        setMinPayment(String(initialData.min_payment))
      } else if (initialData.min_payment_amount) {
        setMinPayment(String(initialData.min_payment_amount))
      }
    }
  }, [initialData, setValue])

  async function onSubmit(status: string, shouldSendEmail: boolean) {
    setIsLoading(true)
    try {
      const sb = createClientBrowser()
      const companyId = await getCurrentCompanyId(sb)
      if (!companyId) {
        toast.error("Company not found. Please complete onboarding.")
        return
      }

      const values = getValues()
      if (!values.client_id || !values.invoice_number) {
        toast.error("Please fill in all required fields")
        return
      }

      // Build the invoice payload. We DO NOT spread `...values` because
      // that includes `items` (a form-only array — persisted to
      // invoice_items separately) and any other form keys that don't
      // exist as columns. Sending an unknown key makes PostgREST return
      // a 400 from its schema cache. We whitelist only the real
      // `invoices` columns here.
      //
      // NOTE: the `invoices` table does NOT have an `allowed_gateways`
      // column — that lives on the CLIENT. Per-invoice payment controls
      // use pluralised names: allows_partial_payments (not
      // allows_partial_payment) and min_payment (not min_payment_amount).
      const payload: Record<string, any> = {
        client_id: values.client_id,
        invoice_number: values.invoice_number,
        status: status,
        // `issue_date` is NOT NULL on the invoices table. Default it
        // to today so the form never sends NULL.
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: values.due_date || null,
        notes: values.notes || null,
        tax_rate: values.tax_rate ?? 0,
        company_id: companyId,
        company_address_id: selectedCompanyAddressId || null,
        allows_partial_payments: allowsPartial,
        min_payment: minPayment === "" ? null : Number(minPayment),
        currency_code: null,
        subtotal: 0,
        tax_amount: 0,
        total_amount: 0,
        amount_paid: 0,
      }
      // Strip any null/undefined keys for cleanliness.
      for (const k of Object.keys(payload)) {
        if ((payload as any)[k] === undefined) delete (payload as any)[k]
      }

      let result
      if (isEdit && invoiceId) {
        const { data, error } = await safeUpdate(sb, "invoices", payload, { id: invoiceId })
        if (error) throw new Error(error)
        if (!data || !data[0]) throw new Error("Invoice was not saved. Please refresh and try again.")
        result = data[0]
      } else {
        const { data, error } = await safeInsert(sb, "invoices", payload)
        if (error) throw new Error(error)
        if (!data || !data[0]) throw new Error("Invoice was not created. Please refresh and try again.")
        result = data[0]
      }

      // Persist line items into invoice_items. We always write a
      // `description` (falling back to the selected service name) so
      // the line shows up correctly on the invoice, pay page, receipt,
      // and emails — even if the underlying service is later deleted.
      const lineItems = (values.items || []).filter((it: any) => it.service_id || it.description)
      if (lineItems.length > 0) {
        const itemsPayload = lineItems.map((it: any) => {
          const svc = services.find((s: any) => s.id === it.service_id)
          const desc = (it.description && it.description.trim()) || svc?.name || "Service"
          return {
            invoice_id: result.id,
            service_id: it.service_id || null,
            description: desc,
            quantity: Number(it.quantity || 1),
            unit_price: Number(it.unit_price || 0),
            total_amount: Number(it.quantity || 1) * Number(it.unit_price || 0),
          }
        })

        if (isEdit) {
          // Replace items wholesale on edit (matches QuotationForm pattern).
          // Allow 0 rows (e.g. invoice had no items previously).
          await safeDelete(sb, "invoice_items", { invoice_id: result.id }, { expectAtLeastOne: false })
        }
        const { error: iE } = await safeInsert(sb, "invoice_items", itemsPayload)
        if (iE) throw new Error(iE)
      } else if (isEdit) {
        // Edit with zero items: clear out any old ones to stay in sync.
        await safeDelete(sb, "invoice_items", { invoice_id: result.id }, { expectAtLeastOne: false })
      }

      // Persist per-invoice payment methods (gateways). The form's
      // invoiceGateways list lives in invoice_payment_methods, NOT on the
      // invoices row itself. We clear & re-insert on every save so the
      // set always matches what the user picked.
      if (invoiceGateways.length > 0) {
        await safeDelete(sb, "invoice_payment_methods", { invoice_id: result.id }, { expectAtLeastOne: false })
        const pmPayload = invoiceGateways.map((g) => ({
          invoice_id: result.id,
          payment_method: g,
          company_id: companyId,
        }))
        const { error: pmE } = await safeInsert(sb, "invoice_payment_methods", pmPayload, { expectAtLeastOne: false })
        if (pmE) throw new Error(pmE)
      } else if (isEdit) {
        await safeDelete(sb, "invoice_payment_methods", { invoice_id: result.id }, { expectAtLeastOne: false })
      }

      if (shouldSendEmail) {
        await fetch("/api/invoices/send", {
          method: "POST",
          body: JSON.stringify({ invoiceId: result.id })
        })
      }

      toast.success(isEdit ? "Invoice updated!" : "Invoice created!")
      window.location.href = isEdit ? `/invoices/${invoiceId}` : `/invoices/${result.id}`
    } catch (err: any) {
      toast.error(err.message || "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Basic Information</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Client *</Label>
              <select 
                {...register("client_id")} 
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select a client</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.full_name} ({c.email})</option>)}
              </select>
              {errors.client_id && <p className="text-xs text-red-500">{errors.client_id?.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Invoice Number *</Label>
              <Input {...register("invoice_number")} placeholder="INV-001" />
              {errors.invoice_number && <p className="text-xs text-red-500">{errors.invoice_number?.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input type="date" {...register("due_date")} />
            </div>
            <div className="space-y-2">
              <Label>Tax Rate (%)</Label>
              <Input type="number" {...register("tax_rate")} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Company Address</Label>
              <select 
                value={selectedCompanyAddressId} 
                onChange={(e) => setSelectedCompanyAddressId(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                {companyOffices.map(o => <option key={o.id} value={o.id}>{o.address_name || `${o.street}, ${o.city}`}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Billing Items</CardTitle></CardHeader>
        <CardContent>
          <BillingItems control={control} setValue={setValue} watch={watch} services={services} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payment Settings</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Partial Payments</Label>
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={allowsPartial} 
                  onChange={(e) => setAllowsPartial(e.target.checked)} 
                />
                <span className="text-sm">Allow client to pay any amount</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Minimum Payment</Label>
              <Input 
                type="number" 
                value={minPayment} 
                onChange={(e) => setMinPayment(e.target.value)} 
                placeholder="0.00" 
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Payment Gateways</Label>
            {activeGateways.length === 0 ? (
              <p className="text-xs text-slate-500">No active gateways. Configure in Settings &rarr; Payments.</p>
            ) : (
              <div className="flex flex-wrap gap-4">
                {activeGateways.map(g => (
                  <label key={g.gateway_name} className="flex items-center gap-2 text-sm">
                    <input 
                      type="checkbox" 
                      checked={invoiceGateways.includes(g.gateway_name)} 
                      onChange={() => {
                        const name = g.gateway_name
                        setInvoiceGateways(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
                      }} 
                    />
                    <span className="capitalize">{g.gateway_name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Summary & Notes</CardTitle></CardHeader>
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
  )
}
