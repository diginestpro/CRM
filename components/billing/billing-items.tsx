"use client"

import { useFieldArray, Control, UseFormSetValue, UseFormWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2 } from 'lucide-react'

interface Item {
  service_id: string
  quantity: number
  unit_price: number
  description?: string
}

interface QuotationItemsProps {
  control: Control<any>
  setValue: UseFormSetValue<any>
  watch: UseFormWatch<any>
  services: { id: string; name: string; base_price: number }[]
}

export function BillingItems({ control, setValue, watch, services }: QuotationItemsProps) {
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const values = watch()

  const handleServiceChange = (idx: number, id: string) => {
    const s = services.find(s => s.id === id)
    if (s) setValue(`items.${idx}.unit_price`, s.base_price)
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
        <h3 className="font-semibold">Line Items</h3>
        <Button type="button" variant="outline" size="sm" onClick={() => append({ service_id: '', quantity: 1, unit_price: 0 })}>
          <Plus className="h-4 w-4 mr-1" /> Add Item
        </Button>
      </div>
      <div className="p-6 space-y-4">
        {fields.map((f, i) => (
          <div key={f.id} className="grid grid-cols-1 gap-4 md:grid-cols-12 items-end border-b pb-4 last:border-0 last:pb-0">
            <div className="md:col-span-4 space-y-2">
              <Label className="text-xs">Service</Label>
              <select 
                {...control.register(`items.${i}.service_id` as any)} 
                onChange={(e) => handleServiceChange(i, e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select Service</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label className="text-xs">Qty</Label>
              <Input type="number" {...control.register(`items.${i}.quantity` as any, { valueAsNumber: true })} />
            </div>
            <div className="md:col-span-3 space-y-2">
              <Label className="text-xs">Unit Price</Label>
              <Input type="number" step="0.01" {...control.register(`items.${i}.unit_price` as any, { valueAsNumber: true })} />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label className="text-xs">Total</Label>
              <div className="h-10 flex items-center font-medium">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
                  Number(values.items?.[i]?.quantity || 0) * Number(values.items?.[i]?.unit_price || 0)
                )}
              </div>
            </div>
            <div className="md:col-span-1">
              <Button type="button" variant="ghost" size="icon" className="text-red-500" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>
      <div className="p-6 bg-slate-50 border-t text-right space-y-2">
        <div className="text-sm text-slate-500">Grand Total</div>
        <div className="text-3xl font-bold text-slate-900">
          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
            values.items?.reduce((a: number, i: any) => a + (i.quantity * i.unit_price), 0) || 0
          )}
        </div>
      </div>
    </div>
  )
}
