with open(r'C:\Users\LENOVO\Desktop\CRM\lib\payments.ts','rb') as f:
    c = f.read()
idx = c.find(b'await supabase.from("invoices").update')
print(repr(c[idx:idx+700]))
