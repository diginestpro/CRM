with open(r'C:\Users\LENOVO\Desktop\CRM\lib\payments.ts','rb') as f:
    c = f.read()
import re
m = re.search(rb'await supabase\.from\("payment_transactions"\)\.insert\(\{[^}]+\}\)[^/]*', c, re.DOTALL)
if m:
    print(repr(m.group()))
else:
    print('NO MATCH')
