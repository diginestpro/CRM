"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MoreVertical, ExternalLink, Edit, Copy, Printer } from "lucide-react"
import { toast } from "sonner"

interface InvoiceRowActionsProps {
  invoiceId: string
  invoiceNumber: string
}

export function InvoiceRowActions({ invoiceId, invoiceNumber }: InvoiceRowActionsProps) {
  const router = useRouter()

  const handleCopyLink = () => {
    const url = window.location.origin + "/pay/" + invoiceId
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Payment link copied!", { description: url })
    }).catch(() => {
      toast.success("Payment link:", { description: url })
    })
  }

  const handleOpenPay = () => {
    window.open("/pay/" + invoiceId, "_blank")
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href={"/invoices/" + invoiceId} className="flex items-center cursor-pointer">
            <ExternalLink className="h-4 w-4 mr-2" />
            View Details
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={"/invoices/" + invoiceId + "/edit"} className="flex items-center cursor-pointer">
            <Edit className="h-4 w-4 mr-2" />
            Edit Invoice
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
          <Copy className="h-4 w-4 mr-2" />
          Copy Payment Link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleOpenPay} className="cursor-pointer">
          <ExternalLink className="h-4 w-4 mr-2" />
          Open Payment Page
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/invoices/" + invoiceId)} className="cursor-pointer">
          <Printer className="h-4 w-4 mr-2" />
          Print Preview
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
