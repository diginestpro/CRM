p = r'C:\Users\LENOVO\Desktop\CRM\app\pay\[id]\page.tsx'
with open(p, 'rb') as f:
    c = f.read()

old = (
    b'                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</Label>\n'
    b'                  <Input type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="mt-1.5 text-lg font-medium" />\n'
    b'                </div>\n'
)
new = (
    b'                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{invoice.status === "Partial" ? `Pay Amount (max ${formatMoney(remaining, currency)})` : "Amount"}</Label>\n'
    b'                  <Input type="number" step="0.01" max={remaining} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="mt-1.5 text-lg font-medium" />\n'
    b'                  {invoice.status === "Partial" && <p className="text-xs text-slate-500 mt-1">Pay any amount up to the remaining balance</p>}\n'
    b'                </div>\n'
)
if old in c:
    c = c.replace(old, new)
    print('OK')
else:
    print('NOT FOUND')
with open(p, 'wb') as f:
    f.write(c)
