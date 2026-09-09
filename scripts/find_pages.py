import os
ROOT = r"C:\Users\LENOVO\Desktop\CRM\app\(authed)"
for base, dirs, files in os.walk(ROOT):
    for f in files:
        if f == "page.tsx":
            full = os.path.join(base, f)
            if "(new)" in full or "(edit)" in full:
                print(full)
