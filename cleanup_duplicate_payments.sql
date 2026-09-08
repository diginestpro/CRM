-- ============================================
-- Cleanup Duplicate Payment Records
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Find all invoices with duplicate payments
SELECT
  invoice_id,
  COUNT(*) as payment_count,
  SUM(amount) as total_paid,
  MIN(created_at) as first_payment_at,
  MAX(created_at) as last_payment_at
FROM public.invoice_payments
GROUP BY invoice_id
HAVING COUNT(*) > 1
ORDER BY last_payment_at DESC;

-- 2. Delete duplicate payments (keep the OLDEST one for each invoice)
DELETE FROM public.invoice_payments p1
USING public.invoice_payments p2
WHERE p1.invoice_id = p2.invoice_id
  AND p1.created_at > p2.created_at;

-- 3. Recompute amount_paid for ALL invoices (in case totals drifted)
UPDATE public.invoices i
SET
  amount_paid = COALESCE(sub.total, 0),
  status = CASE
    WHEN COALESCE(sub.total, 0) >= i.total_amount THEN 'Paid'
    WHEN COALESCE(sub.total, 0) > 0 THEN 'Partial'
    ELSE i.status
  END,
  updated_at = NOW()
FROM (
  SELECT invoice_id, SUM(amount) as total
  FROM public.invoice_payments
  GROUP BY invoice_id
) sub
WHERE i.id = sub.invoice_id;

-- 4. Verify: should show no duplicates now
SELECT
  invoice_id,
  COUNT(*) as payment_count,
  SUM(amount) as total_paid
FROM public.invoice_payments
GROUP BY invoice_id
HAVING COUNT(*) > 1;
