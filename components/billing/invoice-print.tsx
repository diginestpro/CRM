import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface InvoicePrintProps {
  invoice: any
}

export function InvoicePrintLayout({ invoice }: InvoicePrintProps) {
  return (
    <div className="hidden print:block p-8 space-y-8 text-slate-900">
      <div className="flex justify-between items-start border-b pb-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold">INVOICE</h1>
          <p className="text-xl font-semibold">{invoice.invoice_number}</p>
          <p className="text-slate-600">Date: {new Date(invoice.created_at).toLocaleDateString()}</p>
          <p className="text-slate-600">Due Date: {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'N/A'}</p>
        </div>
        <div className="text-right space-y-1">
          <h3 className="font-bold text-lg">From:</h3>
          <p>My Company Name</p>
          <p>company@example.com</p>
          <p>123 Business Street, City, State</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-2">
          <h3 className="font-bold text-slate-500 uppercase text-sm">Bill To:</h3>
          <p className="font-bold text-lg">{invoice.clients?.full_name}</p>
          <p>{invoice.clients?.company_name}</p>
          <p>{invoice.clients?.email}</p>
          <p>{invoice.clients?.phone}</p>
        </div>
        <div className="text-right space-y-2">
          <h3 className="font-bold text-slate-500 uppercase text-sm">Invoice Status:</h3>
          <p className="font-bold text-lg">{invoice.status}</p>
        </div>
      </div>

      <Table className="w-full">
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead className="text-center">Qty</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoice.invoice_items.map((item: any) => (
            <TableRow key={item.id}>
              <TableCell className="py-4">
                <span className="font-medium">{item.services?.name}</span>
                {item.description && <p className="text-xs text-slate-500">{item.description}</p>}
              </TableCell>
              <TableCell className="text-center">{item.quantity}</TableCell>
              <TableCell className="text-right">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.unit_price)}</TableCell>
              <TableCell className="text-right font-medium">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.quantity * item.unit_price)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex justify-end">
        <div className="w-64 space-y-3">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.total_amount)}</span>
          </div>
          <div className="flex justify-between text-xl font-bold border-t pt-3">
            <span>Total Amount</span>
            <span>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.total_amount)}</span>
          </div>
        </div>
      </div>

      <div className="pt-12 text-center text-slate-400 text-sm">
        <p>Thank you for your business!</p>
        <p>Please make payment by the due date mentioned above.</p>
      </div>
    </div>
  )
}
