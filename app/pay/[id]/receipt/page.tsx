"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle, Download, Printer, Loader2, XCircle, ArrowLeft } from "lucide-react"

function formatMoney(amount: number, currency: string = "USD") {
  const symbols: Record<string, string> = { USD: "$", PKR: "Rs", EUR: "€", GBP: "£" }
  const s = symbols[currency] || currency
  return `${s} ${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ReceiptContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const id = params?.id as string
  const tracker = searchParams.get("tracker") || ""
  const status = searchParams.get("status") || "success"
  const errorMsg = searchParams.get("error") || ""

  const [loading, setLoading] = useState(true)
  const [receipt, setReceipt] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [client, setClient] = useState<any>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/public/invoice/" + id)
        const data = await res.json()
        if (res.ok && data.invoice) {
          setReceipt(data.invoice)
          setClient(data.invoice.clients || null)
          setCompany(data.invoice.companies || null)
        }
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [id])

  function handlePrint() { if (typeof window !== "undefined") window.print() }

  function handleDownload() {
    if (typeof window === "undefined") return
    const html = document.getElementById("receipt-content")?.innerHTML || ""
    const w = window.open("", "_blank")
    if (!w) return
    w.document.write(`<!doctype html><html><head><title>Receipt</title>
      <style>body{font-family:system-ui,-apple-system,sans-serif;padding:40px;color:#0f172a}
      table{width:100%;border-collapse:collapse;margin-top:20px}
      td,th{padding:10px;text-align:left;border-bottom:1px solid #e2e8f0}
      .right{text-align:right}
      </style></head><body>${html}</body></html>`)
    w.document.close(); w.print()
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    )
  }

  const isSuccess = status === "success"
  const currency = receipt?.currency_code || "USD"
  const amount = Number(receipt?.amount_paid || receipt?.total_amount || 0)
  const paidDate = new Date().toLocaleDateString()
  const brandColor = company?.brand_color || "#2563eb"

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4 print:bg-white print:py-0">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-4 print:hidden">
          <Button variant="ghost" onClick={() => window.history.length > 1 ? window.history.back() : window.close()}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" /> Print
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" /> PDF
            </Button>
          </div>
        </div>

        <div id="receipt-content">
          <Card className="mb-4 print:shadow-none print:border-0">
            <CardContent className="pt-6">
              <div className="text-center">
                {isSuccess
                  ? <CheckCircle className="h-16 w-16 mx-auto text-green-500 mb-3" />
                  : <XCircle className="h-16 w-16 mx-auto text-red-500 mb-3" />}
                <h1 className="text-2xl font-bold mb-1">{isSuccess ? "Payment Received" : "Payment Failed"}</h1>
                <p className="text-slate-500 text-sm">
                  {isSuccess ? "Thank you! Your payment has been recorded." : errorMsg || "We could not record your payment."}
                </p>
              </div>
            </CardContent>
          </Card>

          {receipt && (
            <Card className="print:shadow-none print:border-0">
              <CardContent className="pt-6">
                <div className="header" style={{ borderBottom: "2px solid #e2e8f0", paddingBottom: 20, marginBottom: 24 }}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-xl font-bold" style={{ color: brandColor }}>{company?.name || "Receipt"}</h2>
                      {(receipt as any)?.from_block?.address_name && (
                        <p className="text-xs font-semibold text-blue-600 mt-0.5">{(receipt as any).from_block.address_name}</p>
                      )}
                      {((receipt as any)?.from_block?.address_lines?.length ?? 0) > 0 ? (
                        (receipt as any).from_block.address_lines.map((line: string, idx: number) => (
                          <p key={idx} className="text-sm text-slate-500">{line}</p>
                        ))
                      ) : (
                        <>
                          {company?.email && <p className="text-sm text-slate-500">{company.email}</p>}
                          {company?.phone && <p className="text-sm text-slate-500">{company.phone}</p>}
                        </>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wider text-slate-400">Receipt</p>
                      <p className="font-mono text-sm">{receipt.invoice_number || id.slice(0, 8)}</p>
                      <p className="text-xs text-slate-500 mt-1">Paid on {paidDate}</p>
                    </div>
                  </div>
                </div>

                {client && (
                  <div className="mb-6">
                    <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Billed To</p>
                    <p className="font-semibold">{client.full_name}</p>
                    {client.company_name && <p className="text-sm text-slate-600">{client.company_name}</p>}
                    {client.email && <p className="text-sm text-slate-600">{client.email}</p>}
                  </div>
                )}

                {receipt.invoice_items && receipt.invoice_items.length > 0 && (
                  <table className="w-full" style={{ borderCollapse: "collapse", marginTop: 16 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                        <th className="text-left py-2 text-xs uppercase tracking-wider text-slate-500">Description</th>
                        <th className="text-right py-2 text-xs uppercase tracking-wider text-slate-500">Qty</th>
                        <th className="text-right py-2 text-xs uppercase tracking-wider text-slate-500">Price</th>
                        <th className="text-right py-2 text-xs uppercase tracking-wider text-slate-500">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipt.invoice_items.map((item: any, i: number) => (
                        <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td className="py-2 text-sm">{item.description || "Item"}</td>
                          <td className="py-2 text-sm text-right">{item.quantity || 1}</td>
                          <td className="py-2 text-sm text-right">{formatMoney(item.unit_price || 0, currency)}</td>
                          <td className="py-2 text-sm text-right font-medium">{formatMoney((item.quantity || 1) * (item.unit_price || 0), currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div className="mt-6 flex justify-end">
                  <div className="w-64">
                    <div className="flex justify-between py-1 text-sm">
                      <span className="text-slate-500">Subtotal</span>
                      <span>{formatMoney(receipt.subtotal || receipt.total_amount || 0, currency)}</span>
                    </div>
                    {(receipt.tax_amount > 0) && (
                      <div className="flex justify-between py-1 text-sm">
                        <span className="text-slate-500">Tax</span>
                        <span>{formatMoney(receipt.tax_amount, currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-2 mt-2" style={{ borderTop: "2px solid #e2e8f0", borderBottom: "2px solid #e2e8f0" }}>
                      <span className="font-bold">Amount Paid</span>
                      <span className="font-bold" style={{ color: "#059669" }}>{formatMoney(amount, currency)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-slate-50 rounded-lg text-sm print:bg-white print:border">
                  <p className="text-xs uppercase tracking-wider text-slate-400 mb-2">Payment Details</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-slate-500">Method:</span> <span className="font-medium">SafePay</span></div>
                    <div><span className="text-slate-500">Status:</span> <span className="font-medium text-green-600">Completed</span></div>
                    {tracker && (
                      <div className="col-span-2"><span className="text-slate-500">Reference:</span> <span className="font-mono text-xs">{tracker}</span></div>
                    )}
                    <div className="col-span-2"><span className="text-slate-500">Invoice:</span> <span className="font-mono text-xs">{receipt.invoice_number}</span></div>
                  </div>
                </div>

                {company?.website && (
                  <p className="text-center text-xs text-slate-400 mt-6">
                    Questions? Contact us at {company.email || company.website}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ReceiptPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    }>
      <ReceiptContent />
    </Suspense>
  )
}
