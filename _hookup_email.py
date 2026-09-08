p = r'C:\Users\LENOVO\Desktop\CRM\lib\payments.ts'
with open(p, 'rb') as f:
    c = f.read()

# Add import for sendReceiptEmail at the top
old_import = b'import { createClientServer } from "@/lib/supabase/server"\nimport { getPaymentGateway } from "@/lib/payment-gateways"'
new_import = b'import { createClientServer } from "@/lib/supabase/server"\nimport { getPaymentGateway } from "@/lib/payment-gateways"\nimport { sendReceiptEmail } from "@/lib/email"'
if old_import in c:
    c = c.replace(old_import, new_import)
    print('import added')

# Find the spot where invoice status becomes Paid. That's where we trigger the receipt email.
# Look for the invoice status update line that uses "Paid"
old_status = b'  const status = totalPaid >= (invoice?.total_amount || 0) ? "Paid" : "Unpaid"'
new_status = b'  const newStatus = totalPaid >= (invoice?.total_amount || 0) ? "Paid" : (totalPaid > 0 ? "Partial" : "Unpaid")\n  const statusChangedToPaid = newStatus === "Paid" && invoice?.status !== "Paid"'
if old_status in c:
    c = c.replace(old_status, new_status)
    print('status logic updated')

# Update the update to use newStatus
old_update = b'await supabase.from("invoices").update({ status, amount_paid: totalPaid }).eq("id", invoiceId)'
new_update = b'await supabase.from("invoices").update({ status: newStatus, amount_paid: totalPaid }).eq("id", invoiceId)'
if old_update in c:
    c = c.replace(old_update, new_update)
    print('update uses newStatus')

# Find the success return and add email trigger before it
old_return = b'  return { success: true }\n}\n\nexport async function handlePaymentWebhook'
if old_return in c:
    # Insert email trigger before return
    trigger = (
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
        b'  return { success: true }\n}\n\nexport async function handlePaymentWebhook'
    )
    c = c.replace(old_return, trigger)
    print('email trigger added')

with open(p, 'wb') as f:
    f.write(c)
