"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Printer, Share2 } from "lucide-react"

interface InvoiceActionsProps {
  invoiceId: string
}

export function InvoiceActions({ invoiceId }: InvoiceActionsProps) {
  const handlePrint = () => {
    if (typeof window !== "undefined") window.print()
  }

  const handleShare = () => {
    const url = window.location.origin + "/pay/" + invoiceId
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        alert("Payment link copied!\n\n" + url)
      }).catch(() => {
        alert("Payment link: " + url)
      })
    } else {
      alert("Payment link: " + url)
    }
  }

  return (
    <div className="flex gap-3">
      <Button variant="outline" onClick={handlePrint} className="flex items-center gap-2">
        <Printer className="h-4 w-4" /> Print
      </Button>
      <Button variant="outline" onClick={handleShare} className="flex items-center gap-2">
        <Share2 className="h-4 w-4" /> Share Link
      </Button>
      <Button variant="outline" asChild>
        <Link href={"/invoices/" + invoiceId + "/edit"}>Edit Invoice</Link>
      </Button>
    </div>
  )
}
