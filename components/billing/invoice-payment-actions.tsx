"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PlusCircle, Link as LinkIcon, Loader2 } from 'lucide-react'
import { RecordPaymentModal } from '@/components/billing/record-payment-modal'
import { toast } from 'sonner'

export function InvoicePaymentActions({ invoice }: { invoice: any }) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState<{ [key: string]: boolean }>({})

  const handleGenerateLink = async (gateway: string) => {
    setIsGenerating(prev => ({ ...prev, [gateway]: true }))
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id, gateway }),
      })
      
      if (!res.ok) throw new Error('Failed to generate payment link')
      
      // In a real app, we might copy the URL to clipboard or email it.
      // For this one-click experience, we redirect the user to the checkout page.
      window.location.href = res.url
    } catch (e: any) {
      toast.error(e.message || 'Error generating link')
    } finally {
      setIsGenerating(prev => ({ ...prev, [gateway]: false }))
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex gap-2">
        <Button 
          variant="outline" 
          onClick={() => setIsModalOpen(true)} 
          className="flex items-center gap-2"
          disabled={invoice.status === 'Paid'}
        >
          <PlusCircle className="h-4 w-4" /> 
          {invoice.status === 'Paid' ? 'Fully Paid' : 'Manual Record'}
        </Button>
        
        <div className="flex gap-2">
          <Button 
            variant="secondary" 
            onClick={() => handleGenerateLink('stripe')} 
            disabled={invoice.status === 'Paid' || isGenerating['stripe']}
            className="flex items-center gap-2"
          >
            {isGenerating['stripe'] ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
            Stripe
          </Button>
          <Button 
            variant="secondary" 
            onClick={() => handleGenerateLink('paypal')} 
            disabled={invoice.status === 'Paid' || isGenerating['paypal']}
            className="flex items-center gap-2"
          >
            {isGenerating['paypal'] ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
            PayPal
          </Button>
          <Button 
            variant="secondary" 
            onClick={() => handleGenerateLink('safepay')} 
            disabled={invoice.status === 'Paid' || isGenerating['safepay']}
            className="flex items-center gap-2"
          >
            {isGenerating['safepay'] ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
            SafePay
          </Button>
        </div>
      </div>
      
      <RecordPaymentModal 
        invoice={invoice} 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </div>
  )
}

