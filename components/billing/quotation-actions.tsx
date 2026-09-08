"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Printer } from "lucide-react"

interface QuotationActionsProps {
  quotationId: string
}

export function QuotationActions({ quotationId }: QuotationActionsProps) {
  const handlePrint = () => {
    if (typeof window !== "undefined") window.print()
  }

  return (
    <div className="flex gap-3">
      <Button variant="outline" onClick={handlePrint} className="flex items-center gap-2">
        <Printer className="h-4 w-4" /> Print
      </Button>
      <Button variant="outline" asChild>
        <Link href={"/quotations/" + quotationId + "/edit"}>Edit Quotation</Link>
      </Button>
    </div>
  )
}
