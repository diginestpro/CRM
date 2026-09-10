import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BRAND_NAME_FALLBACK } from '@/lib/branding'
import { LegalFooterLinksServer } from '@/components/billing/legal-footer-links-server'

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
          {/* Use the resolved from_block (server-loaded) when present — that
              gives us the user's chosen office address (USA / PK / UAE / ...)
              for THIS invoice. Falls back to the legacy companies.address
              columns if from_block is unavailable (older callers). */}
          {invoice.from_block ? (
            <>
              <p className="font-semibold">{invoice.from_block.name}</p>
              {invoice.from_block.address_name && (
                <p className="text-xs text-slate-500 italic">{invoice.from_block.address_name}</p>
              )}
              {invoice.from_block.address_lines.map((line: string, idx: number) => (
                <p key={idx}>{line}</p>
              ))}
              {invoice.from_block.email && <p className="text-slate-600">{invoice.from_block.email}</p>}
              {invoice.from_block.phone && <p className="text-slate-600">{invoice.from_block.phone}</p>}
            </>
          ) : (
            <>
              {invoice.companies?.name && <p className="font-semibold">{invoice.companies.name}</p>}
              {invoice.companies?.address && <p>{invoice.companies.address}</p>}
              {(invoice.companies?.city || invoice.companies?.state || invoice.companies?.zip) && (
                <p>
                  {[invoice.companies?.city, invoice.companies?.state, invoice.companies?.zip]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              {invoice.companies?.country && <p>{invoice.companies.country}</p>}
              {invoice.companies?.email && <p className="text-slate-600">{invoice.companies.email}</p>}
              {invoice.companies?.phone && <p className="text-slate-600">{invoice.companies.phone}</p>}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-2">
          <h3 className="font-bold text-slate-500 uppercase text-sm">Bill To:</h3>
          <p className="font-bold text-lg">{invoice.clients?.full_name}</p>
          <p>{invoice.clients?.company_name}</p>
          {invoice.clients?.project_name && <p className="italic text-slate-500">Project: {invoice.clients.project_name}</p>}
          <p>{invoice.clients?.email}</p>
          <p>{invoice.clients?.phone}</p>
          {invoice.selected_address && (
            <div className="text-sm text-slate-600 mt-1">
              {invoice.selected_address.label && <div className="font-semibold mt-1">{invoice.selected_address.label}</div>}
              {invoice.selected_address.street && <div>{invoice.selected_address.street}</div>}
              {(invoice.selected_address.city || invoice.selected_address.state || invoice.selected_address.postal_code) && (
                <div>
                  {[invoice.selected_address.city, invoice.selected_address.state, invoice.selected_address.postal_code]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              )}
              {invoice.selected_address.country && <div>{invoice.selected_address.country}</div>}
            </div>
          )}
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
                <span className="font-medium">{item.services?.name || item.description || "Service"}</span>
                {item.description && item.description !== (item.services?.name || "") && (
                  <p className="text-xs text-slate-500">{item.description}</p>
                )}
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

      <div className="pt-12 text-center text-slate-400 text-sm space-y-1">
        <p>Thank you for your business!</p>
        <LegalFooterLinksServer
          branding={(invoice as any).branding}
          overrides={(invoice as any).footer_links}
        />
        <p>© {(invoice as any).branding?.copyright_year || new Date().getFullYear()} {(invoice as any).branding?.brand_name || BRAND_NAME_FALLBACK}</p>
      </div>
    </div>
  )
}
