"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MoreVertical, ExternalLink, Edit, Copy, Printer, Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface InvoiceRowActionsProps {
  invoiceId: string
  invoiceNumber: string
}

export function InvoiceRowActions({ invoiceId, invoiceNumber }: InvoiceRowActionsProps) {
  const router = useRouter()
  const [delOpen, setDelOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  async function handleDelete(force: boolean) {
    setDeleting(true)
    try {
      const url = "/api/invoices/" + invoiceId + (force ? "?force=true" : "")
      const res = await fetch(url, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error || "Delete failed")
      } else {
        toast.success("Invoice deleted")
        setDelOpen(false)
        router.refresh()
      }
    } catch (e: any) {
      toast.error(e?.message || "Delete failed")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
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
          <DropdownMenuItem onClick={() => router.push("/invoices/" + invoiceId)} className="cursor-pointer">
            <Printer className="h-4 w-4 mr-2" />
            Print Preview
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDelOpen(true)}
            className="cursor-pointer text-rose-600 focus:text-rose-700"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Invoice
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete confirmation */}
      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete invoice {invoiceNumber}?</DialogTitle>
            <DialogDescription>
              This will remove the invoice and all of its line items,
              payment methods, payments, and email queue entries.
              The activity log will keep a record that the deletion
              happened.
              <br />
              <br />
              <span className="font-semibold">This cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDelOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleDelete(false)}
              disabled={deleting}
              className="gap-1"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
