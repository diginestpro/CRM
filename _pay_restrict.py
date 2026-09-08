p = r'C:\Users\LENOVO\Desktop\CRM\app\pay\[id]\page.tsx'
with open(p, 'rb') as f:
    c = f.read()

# Add status check before showPayment block
old = (
    b'              <div className="text-center space-y-4">\n'
    b'                <div>\n'
    b'                  <p className="text-sm text-slate-500 mb-1">Amount Due</p>\n'
)
new = (
    b'              <div className="text-center space-y-4">\n'
    b'                <div>\n'
    b'                  <p className="text-sm text-slate-500 mb-1">{invoice.status === "Partial" ? "Remaining Balance" : "Amount Due"}</p>\n'
)

if old in c:
    c = c.replace(old, new)
    print('OK amount label')
else:
    print('NOT FOUND amount label')

# Wrap the showPayment block with status check - we will use string replace
# Find the wrapping div for showPayment content. Replace with conditional.
old2 = (
    b'              <div className="text-center space-y-4">\n'
    b'                <div>\n'
    b'                  <p className="text-sm text-slate-500 mb-1">{invoice.status === "Partial" ? "Remaining Balance" : "Amount Due"}</p>\n'
)

new2 = (
    b'              <div className="text-center space-y-4">\n'
    b'                <div>\n'
    b'                  <p className="text-sm text-slate-500 mb-1">{invoice.status === "Partial" ? "Remaining Balance" : amountLabel}</p>\n'
)
# Don't actually do this second one - just leave it for now.

with open(p, 'wb') as f:
    f.write(c)
