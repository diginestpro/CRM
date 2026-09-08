p = r'C:\Users\LENOVO\Desktop\CRM\lib\payments.ts'
with open(p, 'rb') as f:
    c = f.read()

old = (
    b'await supabase.from("invoices").update({ status: newStatus, amount_paid: totalPaid }).eq("id", invoiceId)\n\n'
    b'  return { success: true }\n'
    b'}\r\n'
)
new = (
    b'await supabase.from("invoices").update({ status: newStatus, amount_paid: totalPaid }).eq("id", invoiceId)\n\n'
    b'  // Send receipt email when invoice becomes fully paid\n'
    b'  if (statusChangedToPaid && invoiceId) {\n'
    b'    try {\n'
    b'      const { data: invRow } = await supabase.from("invoices").select("company_id").eq("id", invoiceId).maybeSingle()\n'
    b'      if (invRow?.company_id) {\n'
    b'        await sendReceiptEmail(invRow.company_id, invoiceId)\n'
    b'      }\n'
    b'    } catch (e) {\n'
    b'      console.error("[Webhook] receipt email failed:", e)\n'
    b'    }\n'
    b'  }\n\n'
    b'  return { success: true }\n'
    b'}\r\n'
)
if old in c:
    c = c.replace(old, new)
    print('OK')
else:
    print('NOT FOUND')
with open(p, 'wb') as f:
    f.write(c)
