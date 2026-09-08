p = r'C:\Users\LENOVO\Desktop\CRM\app\pay\[id]\page.tsx'
with open(p, 'rb') as f:
    c = f.read()

# Replace the showPayment block with status-aware rendering
old = (
    b'            {!showPayment ? (\n'
    b'              <div className="text-center space-y-4">\n'
    b'                <div>\n'
    b'                  <p className="text-sm text-slate-500 mb-1">{invoice.status === "Partial" ? "Remaining Balance" : "Amount Due"}</p>\n'
)
new = (
    b'            {invoice.status === "Paid" ? (\n'
    b'              <div className="text-center space-y-3 py-6">\n'
    b'                <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />\n'
    b'                <h3 className="text-2xl font-bold text-green-700">Paid in Full</h3>\n'
    b'                <p className="text-sm text-slate-500">Thank you. This invoice has been fully paid.</p>\n'
    b'                <a href={"/pay/" + invoiceId + "/receipt"} className="inline-block mt-2 text-sm text-blue-600 hover:underline">View Receipt</a>\n'
    b'              </div>\n'
    b'            ) : invoice.status === "Cancelled" ? (\n'
    b'              <div className="text-center space-y-3 py-6">\n'
    b'                <XCircle className="h-16 w-16 text-slate-400 mx-auto" />\n'
    b'                <h3 className="text-2xl font-bold text-slate-700">Invoice Cancelled</h3>\n'
    b'                <p className="text-sm text-slate-500">This invoice has been cancelled and cannot be paid.</p>\n'
    b'              </div>\n'
    b'            ) : !showPayment ? (\n'
    b'              <div className="text-center space-y-4">\n'
    b'                <div>\n'
    b'                  <p className="text-sm text-slate-500 mb-1">{invoice.status === "Partial" ? "Remaining Balance" : "Amount Due"}</p>\n'
)

if old in c:
    c = c.replace(old, new)
    print('OK status guard added')
else:
    print('NOT FOUND')

# Also close the new conditional - need to find the end of the {!showPayment ? (...) : (...)} block
# The showPayment block has form inside it. We need to also wrap the showPayment branch.
# Find where showPayment ? ( ends and the alternative : (...) begins
old_show = (
    b'            ) : (\n'
    b'              <div className="text-center space-y-4">\n'
    b'                <div>\n'
    b'                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</Label>\n'
    b'                  <Input type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="mt-1.5 text-lg font-medium" />\n'
    b'                </div>\n'
)
new_show = (
    b'            ) : (\n'
    b'              <div className="text-center space-y-4">\n'
    b'                <div>\n'
    b'                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{invoice.status === "Partial" ? "Pay Amount (max " + formatMoney(remaining, currency) + ")" : "Amount"}</Label>\n'
    b'                  <Input type="number" step="0.01" max={remaining} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="mt-1.5 text-lg font-medium" />\n'
    b'                  {invoice.status === "Partial" && <p className="text-xs text-slate-500 mt-1">Pay any amount up to the remaining balance</p>}\n'
    b'                </div>\n'
)
if old_show in c:
    c = c.replace(old_show, new_show)
    print('OK payment input updated')
else:
    print('NOT FOUND payment input')

with open(p, 'wb') as f:
    f.write(c)
