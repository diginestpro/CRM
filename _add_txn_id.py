p = r'C:\Users\LENOVO\Desktop\CRM\lib\payments.ts'
with open(p, 'rb') as f:
    c = f.read()

old = (
    b'    .from("payment_transactions").insert({\n'
    b'    invoice_id: invoiceId,\n'
    b'    payment_id: payment.id,\n'
    b'    amount: amount,\n'
    b'    currency_code: invoice?.currency_code || "USD",\n'
    b'    status: "completed",\n'
    b'    raw_response: payload,\n'
    b'  })'
)
new = (
    b'    .from("payment_transactions").insert({\n'
    b'    invoice_id: invoiceId,\n'
    b'    payment_id: payment.id,\n'
    b'    gateway_transaction_id: invoiceId,\n'
    b'    amount: amount,\n'
    b'    currency_code: invoice?.currency_code || "USD",\n'
    b'    status: "completed",\n'
    b'    raw_response: payload,\n'
    b'  })'
)
if old in c:
    c = c.replace(old, new)
    print('OK')
else:
    print('NOT FOUND')
with open(p, 'wb') as f:
    f.write(c)
