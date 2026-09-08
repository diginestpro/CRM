with open(r'C:\Users\LENOVO\Desktop\CRM\lib\payments.ts','rb') as f: c = f.read()
import re
for m in re.finditer(rb'from\("payment_transactions"\)', c):
    pos = m.start()
    print(f'At byte {pos}:')
    print(repr(c[pos:pos+250]))
    print('---')
