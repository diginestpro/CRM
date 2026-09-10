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
import { MoreVertical, ExternalLink, Edit, Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface QuotationRowActionsProps {
  quoteId: string
}

export function QuotationRowActions({ quoteId }: QuotationRowActionsProps) {
  const router = useRouter()
  const [delOpen, setDelOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch("/api/quotations/" + quoteId, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error || "Delete failed")
      } else {
        toast.success("Quotation deleted")
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
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={"/quotations/" + quoteId} className="flex items-center cursor-pointer">
              <ExternalLink className="h-4 w-4 mr-2" />
              View Details
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={"/quotations/" + quoteId + "/edit"} className="flex items-center cursor-pointer">
              <Edit className="h-4 w-4 mr-2" />
              Edit Quotation
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDelOpen(true)}
            className="cursor-pointer text-rose-600 focus:text-rose-700"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Quotation
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete confirmation */}
      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this quotation?</DialogTitle>
            <DialogDescription>
              This will remove the quotation and all of its line items.
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
              onClick={handleDelete}
              disabled={deleting}
              className="gap-1"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete Quotation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
