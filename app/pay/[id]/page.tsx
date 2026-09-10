"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { CheckCircle, Clock, AlertCircle, CreditCard, Loader2, Mail, MapPin, Phone, Printer, Shield, XCircle, ArrowLeft, Receipt } from "lucide-react"
import { LegalFooterLinks } from "@/components/billing/legal-footer-links"

function formatMoney(amount: number, currency: string = "USD") {
  const symbols: Record<string, string> = {
    USD: "$",
    PKR: "Rs",
    EUR: "€",
    GBP: "£",
  }
  const symbol = symbols[currency] || currency
  return `${symbol} ${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function normalizeCurrency(raw: string | null | undefined): string {
  const c = (raw || "").trim()
  if (c === "$" || c === "" || c === "USD" || !c) return "USD"
  if (c === "₨" || c.toLowerCase() === "rs" || c === "PKR") return "PKR"
  if (c === "EUR" || c === "€") return "EUR"
  if (c === "GBP" || c === "£") return "GBP"
  return c
}

function InvoiceContent({ params }: { params: Promise<{ id: string }> }) {
  const searchParams = useSearchParams()
  const [invoice, setInvoice] = useState<any>(null)
  const [client, setClient] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPaying, setIsPaying] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [selectedGateway, setSelectedGateway] = useState<string>("")
  const [paymentAmount, setPaymentAmount] = useState("")
  const [isPaid, setIsPaid] = useState(false)
  const [allowedMethods, setAllowedMethods] = useState<string[]>([])
  const [paymentResult, setPaymentResult] = useState<"success" | "canceled" | null>(null)
  const [invoiceId, setInvoiceId] = useState<string>("")
  const [currentStatus, setCurrentStatus] = useState<string>("")

  // Live status polling - checks every 5s if status changed
  useEffect(() => {
    if (!invoiceId) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/invoices/${invoiceId}/status`)
        const data = await res.json()
        if (data?.status && data.status !== currentStatus) {
          setCurrentStatus(data.status)
          // If status changed to Paid while page is open, refresh
          if (data.status === "Paid") {
            window.location.reload()
          }
        }
      } catch (e) { /* ignore */ }
    }, 5000)
    return () => clearInterval(interval)
  }, [invoiceId, currentStatus])

  useEffect(() => {
    // Check for payment result from URL params
    if (searchParams.get("success") === "true" || searchParams.get("paid") === "true") {
      setPaymentResult("success")
      setShowPayment(false)
    } else if (searchParams.get("canceled") === "true") {
      setPaymentResult("canceled")
    } else if (searchParams.get("error")) {
      setPaymentResult("canceled")
      toast.error("Payment failed: " + (searchParams.get("error") || "unknown"))
    }
  }, [searchParams])

  useEffect(() => {
    async function load() {
      try {
        const { id } = await params
        setInvoiceId(id)
        const res = await fetch("/api/public/invoice/" + id)
        const data = await res.json()
        if (!res.ok) {
          console.error("Failed to load invoice:", data)
          setIsLoading(false)
          return
        }
        const inv = data.invoice
        setInvoice(inv)
        setPaymentAmount(String((inv.total_amount || 0) - (inv.amount_paid || 0)))
        setClient(inv.clients || null)
        setCompany(inv.companies || null)
        // The server returns the resolved allowed_methods list inside
        // data.invoice.allowed_methods. The previous code read
        // data.allowed_methods (which is always undefined), causing the
        // UI to fall back to the hard-coded ["stripe","paypal","safepay"]
        // list - so deactivated gateways (e.g. Stripe with is_active=false)
        // were still visible on the pay page even though the public API
        // had already filtered them out.
        const resolved = inv.allowed_methods
        const list = Array.isArray(resolved) && resolved.length > 0
          ? resolved
          : ["stripe", "paypal", "safepay"]
        setAllowedMethods(list)
        if (list.length > 0) setSelectedGateway(list[0])
        // Update paid status based on actual invoice data
        const fullyPaid = (inv.amount_paid || 0) >= (inv.total_amount || 0)
        setCurrentStatus(inv.status || "")
        if (inv.status === "Paid" || fullyPaid) {
          setIsPaid(true)
          setPaymentResult("success")
        }
      } catch (e) {
        console.error(e)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [params])

  async function handlePayment() {
    if (!selectedGateway) {
      toast.error("Please select a payment method")
      return
    }
    setIsPaying(true)
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          gateway: selectedGateway,
          returnUrl: window.location.origin + "/pay/" + invoice.id,
        }),
      })
      const data = await res.json().catch(() => ({}))
      console.log("[Checkout Response]", res.status, data)
      if (data.url) {
        window.location.href = data.url
      } else if (data.error) {
        toast.error(data.error, { duration: 8000 })
        setIsPaying(false)
      } else {
        toast.error("Unexpected response from server", { duration: 5000 })
        setIsPaying(false)
      }
    } catch (e: any) {
      toast.error(e.message || "Failed", { duration: 5000 })
      setIsPaying(false)
    }
  }

  function handlePrint() {
    if (typeof window !== "undefined") window.print()
  }

  function dismissPaymentResult() {
    setPaymentResult(null)
    // Clean up URL
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      url.searchParams.delete("success")
      url.searchParams.delete("canceled")
      window.history.replaceState({}, "", url.toString())
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto" />
          <p className="mt-3 text-sm text-slate-500">Loading invoice...</p>
        </div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Invoice Not Found</h2>
            <p className="text-slate-500 mt-2 text-sm">This invoice does not exist or the link is invalid.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const statusStyles: any = {
    Draft: { bg: "bg-slate-100", text: "text-slate-700", ring: "ring-slate-200", icon: Clock, label: "Draft" },
    Sent: { bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-200", icon: Clock, label: "Awaiting Payment" },
    Paid: { bg: "bg-green-50", text: "text-green-700", ring: "ring-green-200", icon: CheckCircle, label: "Paid" },
    Overdue: { bg: "bg-red-50", text: "text-red-700", ring: "ring-red-200", icon: AlertCircle, label: "Overdue" },
    Unpaid: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200", icon: AlertCircle, label: "Unpaid" },
  }
  const style = statusStyles[invoice.status] || statusStyles.Unpaid
  const StatusIcon = style.icon
  const remaining = (invoice.total_amount || 0) - (invoice.amount_paid || 0)
  const currency = normalizeCurrency(invoice.currency_code)
  const companyName = company?.name || "Your Company"
  const companyLogo = company?.logo_url
  const companyTagline = company?.tagline
  const companyFooter = company?.footer_text || "Thank you for your business."
  const companyTax = company?.tax_number
  const brandColor = company?.brand_color || "#2563eb"
  const fullyPaid = remaining <= 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 print:bg-white">
      <div className="bg-white border-b border-slate-200 print:hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Shield className="h-4 w-4 text-green-600" />
            <span>Secure payment by {(invoice as any).branding?.brand_name || companyName}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handlePrint} className="text-slate-600">
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6 print:py-0 print:px-0">
        {/* Payment Result Banner */}
        {paymentResult === "success" && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-2xl p-6 shadow-lg print:hidden">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 shadow-md">
                <CheckCircle className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-green-900">Payment Successful! 🎉</h2>
                <p className="text-green-700 mt-1">Thank you! Your payment of <strong>{formatMoney(invoice.total_amount, currency)}</strong> has been received and your invoice is now paid in full.</p>
                <p className="text-sm text-green-600 mt-2">A receipt has been sent to your email. You can safely close this page or print a copy for your records.</p>
                <div className="mt-4 flex gap-2 flex-wrap">
                  <a
                    href={"/pay/" + invoiceId + "/receipt?status=success&tracker=" + (searchParams.get("tracker") || "")}
                    className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 h-8 text-sm font-medium hover:bg-slate-50"
                  >
                    <Receipt className="h-4 w-4 mr-1" /> View Receipt
                  </a>
                  <Button size="sm" variant="outline" onClick={handlePrint} className="bg-white">
                    <Printer className="h-4 w-4 mr-1" /> Print Receipt
                  </Button>
                  <Button size="sm" variant="ghost" onClick={dismissPaymentResult} className="text-green-700">
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {paymentResult === "canceled" && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 print:hidden">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-amber-900">Payment Canceled</p>
                <p className="text-sm text-amber-700">Your payment was canceled. No money was charged. You can try again below.</p>
                <Button size="sm" variant="ghost" onClick={dismissPaymentResult} className="mt-2 text-amber-700">
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden print:shadow-none print:border-0 print:rounded-none">
          <div className="px-6 sm:px-10 py-8 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
              <div className="flex items-start gap-3">
                {companyLogo ? (
                  <img src={companyLogo} alt={companyName} className="h-14 w-14 rounded-xl object-contain bg-white border border-slate-200" />
                ) : (
                  <div className="h-14 w-14 rounded-xl flex items-center justify-center text-white text-xl font-bold shadow-md" style={{ backgroundColor: brandColor }}>
                    {companyName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h1 className="text-xl font-bold text-slate-900">{companyName}</h1>
                  {companyTagline && <p className="text-xs text-slate-500 mt-0.5 italic">{companyTagline}</p>}
                  {company?.email && <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5"><Mail className="h-3 w-3" /> {company.email}</p>}
                  {company?.phone && <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3" /> {company.phone}</p>}
                  {/* Office address (From block). Prefer invoice.from_block (chosen
                      office); fall back to the legacy companies row. */}
                  {((invoice as any)?.from_block?.address_lines?.length || company?.address || company?.city || company?.country) && (
                    <div className="text-sm text-slate-500 flex items-start gap-1 mt-0.5">
                      <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <div>
                        {((invoice as any)?.from_block?.address_name) && (
                          <div className="text-xs font-semibold text-blue-600">
                            {(invoice as any).from_block.address_name}
                          </div>
                        )}
                        {((invoice as any)?.from_block?.address_lines?.length ?? 0) > 0 ? (
                          (invoice as any).from_block.address_lines.map((line: string, idx: number) => (
                            <div key={idx}>{line}</div>
                          ))
                        ) : (
                          <>
                            {company?.address && <div>{company.address}</div>}
                            {(company?.city || company?.state || company?.zip) && (
                              <div>
                                {[company.city, company.state, company.zip].filter(Boolean).join(", ")}
                              </div>
                            )}
                            {company?.country && <div>{company.country}</div>}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Invoice</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{invoice.invoice_number}</p>
                <div className={"mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ring-1 " + style.bg + " " + style.text + " " + style.ring}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  {style.label}
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 sm:px-10 py-8 grid grid-cols-1 md:grid-cols-3 gap-8 border-b border-slate-200">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Date Issued</p>
              <p className="text-sm font-medium text-slate-900">{new Date(invoice.issue_date || invoice.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
            </div>
            {invoice.due_date && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Due Date</p>
                <p className="text-sm font-medium text-slate-900">{new Date(invoice.due_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
              </div>
            )}
            {invoice.po_number && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">PO Number</p>
                <p className="text-sm font-medium text-slate-900">{invoice.po_number}</p>
              </div>
            )}
            {client && (
              <div className="md:col-span-3 md:row-start-2 pt-4 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Billed To</p>
                <p className="text-base font-bold text-slate-900">{client.full_name}</p>
                {client.company_name && <p className="text-sm text-slate-700 mt-0.5">{client.company_name}</p>}
                {client.email && <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5"><Mail className="h-3 w-3" /> {client.email}</p>}
                {client.phone && <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5"><Phone className="h-3 w-3" /> {client.phone}</p>}
                {client.address && (
                  <p className="text-sm text-slate-500 mt-1 flex items-start gap-1.5">
                    <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>
                      {client.address}
                      {client.city && `, ${client.city}`}
                      {client.state && `, ${client.state}`}
                      {client.zip && ` ${client.zip}`}
                      {client.country && `, ${client.country}`}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="px-6 sm:px-10 py-8">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="text-left py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                    <th className="text-right py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">Qty</th>
                    <th className="text-right py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Unit Price</th>
                    <th className="text-right py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-32">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(invoice.invoice_items || []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-sm text-slate-500">
                        <Receipt className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                        No items on this invoice
                      </td>
                    </tr>
                  ) : (
                    (invoice.invoice_items || []).map((item: any) => (
                      <tr key={item.id}>
                        <td className="py-4 pr-4">
                          <p className="text-sm font-medium text-slate-900">{item.description || item.services?.name || "Service"}</p>
                          {item.services?.description && <p className="text-xs text-slate-500 mt-0.5">{item.services.description}</p>}
                        </td>
                        <td className="py-4 text-right text-sm text-slate-700">{item.quantity}</td>
                        <td className="py-4 text-right text-sm text-slate-700">{formatMoney(item.unit_price, currency)}</td>
                        <td className="py-4 text-right text-sm font-semibold text-slate-900">{formatMoney(item.total_amount, currency)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="px-6 sm:px-10 py-6 bg-slate-50 border-t border-slate-200">
            <div className="ml-auto max-w-xs space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Subtotal</span>
                <span className="text-slate-900 font-medium">{formatMoney(invoice.subtotal || invoice.total_amount, currency)}</span>
              </div>
              {invoice.tax_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Tax</span>
                  <span className="text-slate-900 font-medium">{formatMoney(invoice.tax_amount, currency)}</span>
                </div>
              )}
              {invoice.discount_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Discount</span>
                  <span className="text-green-700 font-medium">- {formatMoney(invoice.discount_amount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-3 border-t-2 border-slate-300">
                <span className="text-slate-900">Total</span>
                <span className="text-slate-900">{formatMoney(invoice.total_amount, currency)}</span>
              </div>
              {(invoice.amount_paid || 0) > 0 && (
                <div className="flex justify-between text-sm pt-1">
                  <span className="text-green-700">Paid</span>
                  <span className="text-green-700 font-medium">{formatMoney(invoice.amount_paid, currency)}</span>
                </div>
              )}
              {remaining > 0 && (
                <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-300">
                  <span className="text-slate-900">Amount Due</span>
                  <span className="text-blue-700">{formatMoney(remaining, currency)}</span>
                </div>
              )}
            </div>
          </div>

          {(invoice.notes || invoice.terms) && (
            <div className="px-6 sm:px-10 py-6 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6">
              {invoice.notes && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Notes</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{invoice.notes}</p>
                </div>
              )}
              {invoice.terms && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Terms & Conditions</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{invoice.terms}</p>
                </div>
              )}
            </div>
          )}

          <div className="px-6 sm:px-10 py-6 bg-slate-900 text-slate-300 text-center text-xs print:bg-slate-100 print:text-slate-600">
            <p>{companyFooter}</p>
            {companyTax && <p className="mt-1 opacity-70">Tax ID: {companyTax}</p>}
            <p className="mt-1 opacity-70">
              Powered by {(invoice as any).branding?.brand_name || companyName} -{" "}
              <a href={(invoice as any).footer_links?.website || (invoice as any).branding?.company_website || "https://diginest.pro"} className="underline" target="_blank" rel="noopener noreferrer">{(invoice as any).branding?.company_website?.replace(/^https?:\/\//, "") || "diginest.pro"}</a>
            </p>
            {/* Legal links (Refund Policy / Terms & Conditions / Website).
                Same source-of-truth as the receipt page, the print
                layouts, and the email templates. */}
            <LegalFooterLinks
              branding={(invoice as any).branding}
              overrides={(invoice as any).footer_links}
              variant="white"
              className="mt-3 print:hidden"
            />
          </div>
        </div>

        {fullyPaid ? (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl p-8 text-center print:hidden">
            <div className="h-16 w-16 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <CheckCircle className="h-9 w-9 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-green-900">Paid in Full</h2>
            <p className="text-green-700 mt-2">Thank you! This invoice has been fully paid.</p>
            <p className="text-sm text-green-600 mt-1">Amount: {formatMoney(invoice.total_amount, currency)}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8 print:hidden">
            {invoice.status === "Paid" ? (
              <div className="text-center space-y-3 py-6">
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
                <h3 className="text-2xl font-bold text-green-700">Paid in Full</h3>
                <p className="text-sm text-slate-500">Thank you. This invoice has been fully paid.</p>
                <a href={"/pay/" + invoiceId + "/receipt"} className="inline-block mt-2 text-sm text-blue-600 hover:underline">View Receipt</a>
              </div>
            ) : invoice.status === "Cancelled" ? (
              <div className="text-center space-y-3 py-6">
                <XCircle className="h-16 w-16 text-slate-400 mx-auto" />
                <h3 className="text-2xl font-bold text-slate-700">Invoice Cancelled</h3>
                <p className="text-sm text-slate-500">This invoice has been cancelled and cannot be paid.</p>
              </div>
            ) : !showPayment ? (
              <div className="text-center space-y-4">
                <div>
                  <p className="text-sm text-slate-500 mb-1">{invoice.status === "Partial" ? "Remaining Balance" : "Amount Due"}</p>
                  <p className="text-4xl font-bold text-slate-900">{formatMoney(remaining, currency)}</p>
                </div>
                <Button onClick={() => setShowPayment(true)} size="lg" className="w-full sm:w-auto text-base px-8 py-6 text-white" style={{ backgroundColor: brandColor }}>
                  <CreditCard className="h-5 w-5 mr-2" /> Pay Now
                </Button>
                <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
                  <Shield className="h-3 w-3" /> Secure payment encrypted via SSL
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                  <div>
                    <p className="text-sm text-slate-500">Paying</p>
                    <p className="text-2xl font-bold text-slate-900">{formatMoney(Number(paymentAmount) || remaining, currency)}</p>
                  </div>
                  <button onClick={() => setShowPayment(false)} className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1">
                    <ArrowLeft className="h-3 w-3" /> Back
                  </button>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {(invoice as any).allows_partial_payments
                      ? `Pay Amount (max ${formatMoney(remaining, currency)})`
                      : "Amount Due"}
                  </Label>
                  {(() => {
                    const partialAllowed = !!(invoice as any).allows_partial_payments
                    const minPay = (invoice as any).min_payment != null
                      ? Number((invoice as any).min_payment)
                      : 0
                    if (partialAllowed) {
                      // Editable: enforce min and max client-side.
                      return (
                        <>
                          <Input
                            type="number"
                            step="0.01"
                            min={minPay || undefined}
                            max={remaining}
                            value={paymentAmount}
                            onChange={(e) => {
                              const raw = e.target.value
                              const num = Number(raw)
                              if (raw === "") { setPaymentAmount(""); return }
                              if (!isFinite(num)) return
                              const clamped = Math.min(Math.max(num, minPay || 0.01), remaining)
                              setPaymentAmount(String(clamped))
                            }}
                            className="mt-1.5 text-lg font-medium"
                          />
                          {minPay > 0 && (
                            <p className="text-xs text-slate-500 mt-1">
                              Minimum payment: {formatMoney(minPay, currency)}.
                            </p>
                          )}
                          <p className="text-xs text-slate-500 mt-1">
                            You may pay any amount up to {formatMoney(remaining, currency)}.
                          </p>
                        </>
                      )
                    }
                    // Locked: full remaining balance, no editing.
                    return (
                      <>
                        <Input
                          type="number"
                          step="0.01"
                          value={paymentAmount}
                          readOnly
                          disabled
                          className="mt-1.5 text-lg font-medium bg-slate-50 cursor-not-allowed"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          This invoice must be paid in full.
                        </p>
                      </>
                    )
                  })()}
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment Method</Label>
                  <div className={"grid gap-3 mt-2 " + (allowedMethods.length === 1 ? "grid-cols-1" : allowedMethods.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
                    {allowedMethods.includes("stripe") && (
                      <button type="button" onClick={() => setSelectedGateway("stripe")} className={"p-4 rounded-xl border-2 text-center transition " + (selectedGateway === "stripe" ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 hover:border-slate-300")}>
                        <CreditCard className="h-6 w-6 mx-auto mb-1.5 text-slate-700" />
                        <span className="text-sm font-semibold text-slate-900">Card</span>
                        <p className="text-[10px] text-slate-500 mt-0.5">Visa, Mastercard</p>
                      </button>
                    )}
                    {allowedMethods.includes("paypal") && (
                      <button type="button" onClick={() => setSelectedGateway("paypal")} className={"p-4 rounded-xl border-2 text-center transition " + (selectedGateway === "paypal" ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 hover:border-slate-300")}>
                        <span className="text-lg font-bold text-[#003087]">Pay<span className="text-[#0070ba]">Pal</span></span>
                        <p className="text-[10px] text-slate-500 mt-0.5">PayPal account</p>
                      </button>
                    )}
                    {allowedMethods.includes("safepay") && (
                      <button type="button" onClick={() => setSelectedGateway("safepay")} className={"p-4 rounded-xl border-2 text-center transition " + (selectedGateway === "safepay" ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 hover:border-slate-300")}>
                        <span className="text-lg font-bold text-slate-900">SafePay</span>
                        <p className="text-[10px] text-slate-500 mt-0.5">Cards & wallets</p>
                      </button>
                    )}
                  </div>
                </div>
                <Button onClick={handlePayment} disabled={isPaying || !selectedGateway} size="lg" className="w-full text-base py-6 text-white" style={{ backgroundColor: brandColor }}>
                  {isPaying ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Shield className="h-5 w-5 mr-2" />}
                  Pay {formatMoney(Number(paymentAmount) || remaining, currency)} Securely
                </Button>
                <p className="text-xs text-slate-500 text-center flex items-center justify-center gap-1.5">
                  <Shield className="h-3 w-3" /> Your payment information is encrypted and secure
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function PublicInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    }>
      <InvoiceContent params={params} />
    </Suspense>
  )
}
