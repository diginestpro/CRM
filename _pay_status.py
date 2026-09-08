p = r'C:\Users\LENOVO\Desktop\CRM\app\pay\[id]\page.tsx'
with open(p, 'rb') as f:
    c = f.read()

# Add polling for live status updates. Add state for currentStatus and a poll effect.
old = (
    b'  const [paymentResult, setPaymentResult] = useState<"success" | "canceled" | null>(null)\n'
    b'  const [invoiceId, setInvoiceId] = useState<string>("")\n'
    b'\n'
    b'  useEffect(() => {'
)

new = (
    b'  const [paymentResult, setPaymentResult] = useState<"success" | "canceled" | null>(null)\n'
    b'  const [invoiceId, setInvoiceId] = useState<string>("")\n'
    b'  const [currentStatus, setCurrentStatus] = useState<string>("")\n'
    b'\n'
    b'  // Live status polling - checks every 5s if status changed\n'
    b'  useEffect(() => {\n'
    b'    if (!invoiceId) return\n'
    b'    const interval = setInterval(async () => {\n'
    b'      try {\n'
    b'        const res = await fetch(`/api/invoices/${invoiceId}/status`)\n'
    b'        const data = await res.json()\n'
    b'        if (data?.status && data.status !== currentStatus) {\n'
    b'          setCurrentStatus(data.status)\n'
    b'          // If status changed to Paid while page is open, refresh\n'
    b'          if (data.status === "Paid") {\n'
    b'            window.location.reload()\n'
    b'          }\n'
    b'        }\n'
    b'      } catch (e) { /* ignore */ }\n'
    b'    }, 5000)\n'
    b'    return () => clearInterval(interval)\n'
    b'  }, [invoiceId, currentStatus])\n'
    b'\n'
    b'  useEffect(() => {'
)

if old in c:
    c = c.replace(old, new)
    print('OK status polling added')
else:
    print('NOT FOUND for polling')

# Update the load effect to capture status
old_load = (
    b'        // Update paid status based on actual invoice data\n'
    b'        const fullyPaid = (inv.amount_paid || 0) >= (inv.total_amount || 0)\n'
    b'        if (inv.status === "Paid" || fullyPaid) {\n'
    b'          setIsPaid(true)\n'
    b'          setPaymentResult("success")\n'
    b'        }\n'
)
new_load = (
    b'        // Update paid status based on actual invoice data\n'
    b'        const fullyPaid = (inv.amount_paid || 0) >= (inv.total_amount || 0)\n'
    b'        setCurrentStatus(inv.status || "")\n'
    b'        if (inv.status === "Paid" || fullyPaid) {\n'
    b'          setIsPaid(true)\n'
    b'          setPaymentResult("success")\n'
    b'        }\n'
)
if old_load in c:
    c = c.replace(old_load, new_load)
    print('OK load updated')
else:
    print('NOT FOUND for load update')

with open(p, 'wb') as f:
    f.write(c)
