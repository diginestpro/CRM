# Schema ↔ Code Mismatch Audit

This audit compares the **live Supabase schema** (captured 2026-09-10 via
`backups/schema_axnulmpsrnfoxjegsmie_20260910_152426.sql`) against every
`.from("…")` call in the codebase.

Each finding is rated:

- 🔴 **BREAKING** — the request fails today (400 / 404 / silent no-op)
- 🟡 **PARTIAL** — works for some rows, fails for others
- 🟢 **CLEANUP** — works today but inconsistent / dead read

---

## 🔴 BREAKING bugs (will fail right now)

### 1. `services.base_price` doesn't exist — column is `unit_price`

- **Files:**
  - `app/(authed)/services/new/page.tsx` (form schema + onSubmit)
  - `app/(authed)/services/[id]/edit/page.tsx` (form schema + onSubmit)
  - `app/(authed)/services/page.tsx` (list page reads `service.base_price`)
  - `components/billing/billing-items.tsx` (reads `s.base_price`)
  - `app/(authed)/quotations/_components/QuotationForm.tsx` (loads `base_price`)
  - `app/(authed)/invoices/_components/InvoiceForm.tsx` (loads `base_price`)
- **Fix:** rename all references to `unit_price`.

### 2. `record-payment-modal` inserts into non-existent columns

- **File:** `components/billing/record-payment-modal.tsx`
- **Wrong columns:**
  - `payment_transactions.transaction_id` → real column is `gateway_transaction_id`
  - `payment_transactions.notes` → does not exist on `payment_transactions`
  - `invoice_payments.status` is missing from the insert
- **Fix:** map the form fields to the real columns. Also fix the
  "Partial vs Unpaid" status logic.

### 3. `activity_logs` page tries to join `auth.users` via PostgREST

- **File:** `app/(authed)/activity/page.tsx`
- **Issue:** `.from("activity_logs").select("*, users:user_id(*)")` —
  PostgREST can't follow a FK into `auth.users` for an anonymous join,
  so the `user` field is always `null` (which masks real bugs).
- **Fix:** do an explicit two-step query (select activity rows → select
  profiles for those user_ids in one batch).

### 4. `proxy.ts` won't run — Next.js expects `middleware.ts`

- **File:** `proxy.ts` at the project root.
- **Issue:** Next.js only treats files named `middleware.ts` (or
  `middleware.js`) — or anything in a `middleware/` directory — as
  middleware. `proxy.ts` is loaded as a normal module and silently does
  nothing for the `matcher` config.
- **Fix:** rename to `middleware.ts`.

---

## 🟡 PARTIAL bugs (work sometimes, fail sometimes)

### 5. `companies.address` / `city` / `state` / `zip` / `country` /
###    `tagline` / `brand_color` / `footer_text` / `invoice_template` columns are NOT in any migration

- **Files:** `app/(authed)/settings/company/page.tsx`,
  `lib/company-address.ts`, `lib/email.ts`, all `*_print*` pages.
- **Issue:** the live schema has them, but they were added by hand
  in the SQL Editor. New environments running the migration files will
  not have them.
- **Fix:** migration `0016_company_and_profile_columns.sql` applied.

### 6. `profiles.phone` / `profiles.email` columns are NOT in any migration

- **Files:** `app/(authed)/settings/team/page.tsx`,
  `app/api/settings/team/invite/route.ts`,
  `components/layout/navbar.tsx`.
- **Fix:** same migration `0016_…` applied.

### 7. Missing FKs on `*_items.service_id` → `services.id`

- **Files affected:**
  - `app/api/public/invoice/[id]/route.ts` (the pay page)
  - `app/(authed)/invoices/[id]/edit/page.tsx`
- **Symptom:** the route did
  `.select("*, invoice_items(*, services(name))")`. PostgREST requires
  a real FK constraint to follow the nested join; without it the
  request fails with `PGRST200: Could not find a relationship` and the
  pay page logs `Failed to load invoice: {}` (empty body).
- **Fix:**
  - Migration `0017_missing_foreign_keys.sql` adds the two FKs.
  - Both routes refactored to use a manual two-step fetch
    (`invoice_items` then `services` IN(...)) so the API stays
    resilient if a future migration drops the FK again.

### 8. `email_log` vs `email_logs` — two tables

- **Issue:** both tables exist. The code uses `email_log`. The
  `email_logs` table has slightly different columns (`recipient_email`
  instead of `to_email`, `error_message` instead of `error`) and is
  unused by code. Not breaking, but messy.
- **Action:** leave as-is (we don't want to drop data without asking).

---

## 🟢 CLEANUP / dead reads (work today, no fix required)

### 8. `InvoiceForm` reads `min_payment_amount` as fallback

- Live column is `min_payment`. The fallback to `min_payment_amount` is
  dead code; the form will simply never use it. No bug.

### 9. `client_addresses` — code uses both `label` and `address_name`

- Live column is `label`. Some old callers still write `address_name`
  (no-op). No bug.

### 10. `selected_address_id` (client) vs `company_address_id` (office)

- Both columns exist on `invoices`. The form correctly writes
  `company_address_id` for the office choice; the detail page correctly
  reads `selected_address_id` for the client's billing address. No bug,
  but the names are easy to confuse.

---

## 📋 Summary of files to change

| File | Change |
|---|---|
| `app/(authed)/services/new/page.tsx` | `base_price` → `unit_price` |
| `app/(authed)/services/[id]/edit/page.tsx` | `base_price` → `unit_price` |
| `app/(authed)/services/page.tsx` | `service.base_price` → `service.unit_price` |
| `components/billing/billing-items.tsx` | `s.base_price` → `s.unit_price` |
| `app/(authed)/quotations/_components/QuotationForm.tsx` | `base_price` → `unit_price` |
| `app/(authed)/invoices/_components/InvoiceForm.tsx` | `base_price` → `unit_price` |
| `components/billing/record-payment-modal.tsx` | rewrite inserts; fix status flow |
| `app/(authed)/activity/page.tsx` | two-step query instead of `users:user_id(*)` |
| `proxy.ts` → `middleware.ts` | rename |
| `supabase/migrations/0016_company_and_profile_columns.sql` | back-fill columns |
| `scripts/verify_schema.ps1` | new script to dump live schema |
