"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { createClientBrowser } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export function ConvertToInvoiceButton({ quotation }: { quotation: any }) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  async function handleConvert() {
    setIsLoading(true)
    try {
      const sb = createClientBrowser()
      
      // 1. Create Invoice
      const { data: invoice, error: invE } = await sb.from('invoices').insert({
        client_id: quotation.client_id,
        invoice_number: `INV-${quotation.quote_number.replace('QT-', '')}`,
        status: 'Draft',
        total_amount: quotation.total_amount,
        company_id: quotation.company_id,
      }).select().single()

      if (invE) throw invE

      // 2. Copy Items
      const itemsToInsert = quotation.quotation_items.map((item: any) => ({
        invoice_id: invoice.id,
        service_id: item.service_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        description: item.description,
      }))

      const { error: itemE } = await sb.from('invoice_items').insert(itemsToInsert)
      if (itemE) throw itemE

      toast.success('Converted to Invoice!')
      router.push(`/invoices/${invoice.id}`)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Error converting to invoice')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button onClick={handleConvert} disabled={isLoading} className="bg-green-600 hover:bg-green-700">
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
      Convert to Invoice
    </Button>
  )
}
