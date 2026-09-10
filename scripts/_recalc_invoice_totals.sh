#!/bin/bash
# Recalculate subtotal / tax_amount / total_amount on every invoice
# from its invoice_items rows. Use after the InvoiceForm fix is
# deployed to repair existing invoices that were saved with hardcoded
# 0 totals.
#
# Tax is computed as: subtotal * (invoices.tax_rate / 100) rounded to 2dp.
# If tax_rate is NULL/0 the tax_amount is left at 0.
set -e

DB_HOST="$1"

IP=$(getent ahosts "$DB_HOST" | awk '{print $1}' | grep -E '^[0-9a-fA-F:]+$' | head -n1)
if [ -z "$IP" ]; then echo "Could not resolve $DB_HOST"; exit 1; fi

echo "==> Recalculating invoice totals on $DB_HOST ..."

PGPASSWORD="$PGPASSWORD" psql -h "$IP" -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
-- 1. For every invoice, sum its line items into subtotal.
WITH sums AS (
  SELECT
    invoice_id,
    ROUND(SUM(quantity * unit_price)::numeric, 2) AS computed_subtotal
  FROM public.invoice_items
  GROUP BY invoice_id
)
UPDATE public.invoices i
SET subtotal = COALESCE(s.computed_subtotal, 0)
FROM sums s
WHERE s.invoice_id = i.id
  AND COALESCE(i.subtotal, 0) <> COALESCE(s.computed_subtotal, 0);

-- 2. tax_amount = subtotal * tax_rate / 100.
UPDATE public.invoices
SET tax_amount = ROUND(COALESCE(subtotal, 0) * COALESCE(tax_rate, 0) / 100.0, 2)
WHERE COALESCE(tax_amount, -1) <> ROUND(COALESCE(subtotal, 0) * COALESCE(tax_rate, 0) / 100.0, 2);

-- 3. total_amount = subtotal + tax_amount.
UPDATE public.invoices
SET total_amount = ROUND(COALESCE(subtotal, 0) + COALESCE(tax_amount, 0), 2)
WHERE COALESCE(total_amount, -1) <> ROUND(COALESCE(subtotal, 0) + COALESCE(tax_amount, 0), 2);

-- 4. amount_paid = sum of completed payments (defensive — usually
--    managed by the webhook, but if some payments were recorded
--    out-of-band we can sync).
WITH paid AS (
  SELECT invoice_id, ROUND(SUM(amount)::numeric, 2) AS total_paid
  FROM public.invoice_payments
  WHERE status = 'Completed'
  GROUP BY invoice_id
)
UPDATE public.invoices i
SET amount_paid = COALESCE(p.total_paid, 0)
FROM paid p
WHERE p.invoice_id = i.id
  AND COALESCE(i.amount_paid, 0) <> COALESCE(p.total_paid, 0);

SELECT
  invoice_number,
  subtotal,
  tax_rate,
  tax_amount,
  total_amount,
  amount_paid,
  status
FROM public.invoices
ORDER BY created_at DESC
LIMIT 10;
SQL

echo "==> Done."
