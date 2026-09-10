"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { createClientBrowser } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const schema = z.object({
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  payment_date: z.string().min(1, 'Required'),
  payment_method: z.string().min(1, 'Required'),
  transaction_id: z.string().optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface RecordPaymentModalProps {
  invoice: any
  isOpen: boolean
  onClose: () => void
}

export function RecordPaymentModal({ invoice, isOpen, onClose }: RecordPaymentModalProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: invoice.total_amount,
      payment_date: new Date().toISOString().split('T')[0],
    }
  })

  async function onSubmit(v: FormValues) {
    setIsLoading(true)
    try {
      const sb = createClientBrowser()

      // 1. Insert payment into invoice_payments.
      //    Real columns: id, invoice_id, amount, payment_date,
      //    payment_method, reference_number, status, notes, created_at.
      const { data: payment, error: pErr } = await sb
        .from('invoice_payments')
        .insert({
          invoice_id: invoice.id,
          amount: v.amount,
          payment_date: v.payment_date,
          payment_method: v.payment_method,
          reference_number: v.transaction_id || null,
          notes: v.notes || null,
          status: 'Completed',
        })
        .select()
        .single()

      if (pErr) throw pErr

      // 2. Insert transaction into payment_transactions.
      //    Real columns: id, invoice_id, payment_id, gateway_transaction_id,
      //    amount, currency_code, status, raw_response, created_at.
      //    Notes do NOT live here — they go on invoice_payments.
      const { error: tErr } = await sb
        .from('payment_transactions')
        .insert({
          invoice_id: invoice.id,
          payment_id: payment.id,
          gateway_transaction_id: v.transaction_id || null,
          amount: v.amount,
          currency_code: invoice.currency_code || 'USD',
          status: 'completed',
        })

      if (tErr) throw tErr

      // 3. Recompute total paid and pick the right invoice status:
      //    Paid      if total >= invoice total
      //    Partial   if some but not all paid
      //    Unpaid    if nothing was paid (defensive)
      const { data: payments } = await sb
        .from('invoice_payments')
        .select('amount')
        .eq('invoice_id', invoice.id)

      const totalPaid = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0
      let status: string
      if (totalPaid <= 0) status = 'Unpaid'
      else if (totalPaid >= Number(invoice.total_amount || 0)) status = 'Paid'
      else status = 'Partial'

      await sb
        .from('invoices')
        .update({ status, amount_paid: totalPaid })
        .eq('id', invoice.id)

      toast.success('Payment recorded successfully!')
      onClose()
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Failed to record payment')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Add a payment for Invoice {invoice.invoice_number}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Amount ($)</Label>
            <Input type="number" step="0.01" {...register('amount', { valueAsNumber: true })} />
            {errors.amount && <p className="text-xs text-red-500">{errors.amount.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Payment Date</Label>
            <Input type="date" {...register('payment_date')} />
            {errors.payment_date && <p className="text-xs text-red-500">{errors.payment_date.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <select {...register('payment_method')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Select Method</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Credit Card">Credit Card</option>
              <option value="PayPal">PayPal</option>
              <option value="Cash">Cash</option>
              <option value="Check">Check</option>
            </select>
            {errors.payment_method && <p className="text-xs text-red-500">{errors.payment_method.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Transaction ID (Optional)</Label>
            <Input {...register('transaction_id')} placeholder="TXN-123456" />
          </div>
          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Input {...register('notes')} placeholder="Payment for Q3 services" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Processing...' : 'Save Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}




