-- ============================================
-- Cleanup ALL Duplicates (one-time)
-- Run in Supabase SQL Editor
-- ============================================

-- 1. Find duplicate payment_transactions
SELECT
  invoice_id,
  COUNT(*) as txn_count,
  STRING_AGG(id::text, ', ') as ids,
  STRING_AGG(created_at::text, ', ') as times
FROM public.payment_transactions
WHERE gateway = 'safepay'
GROUP BY invoice_id
HAVING COUNT(*) > 1;

-- 2. Delete duplicate payment_transactions (keep the OLDEST).
-- We group by invoice_id and keep the row with the earliest created_at.
DELETE FROM public.payment_transactions p1
USING public.payment_transactions p2
WHERE p1.invoice_id = p2.invoice_id
  AND p1.created_at > p2.created_at;

-- 3. Delete duplicate invoice_payments (keep the OLDEST)
DELETE FROM public.invoice_payments p1
USING public.invoice_payments p2
WHERE p1.invoice_id = p2.invoice_id
  AND p1.created_at > p2.created_at;

-- 4. Recompute amount_paid for ALL invoices
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

-- 5. Verify: should show NO duplicates anywhere
SELECT 'invoice_payments' as table_name, invoice_id, COUNT(*) as count, SUM(amount) as total
FROM public.invoice_payments GROUP BY invoice_id HAVING COUNT(*) > 1
UNION ALL
SELECT 'payment_transactions' as table_name, invoice_id, COUNT(*) as count, NULL as total
FROM public.payment_transactions GROUP BY invoice_id HAVING COUNT(*) > 1;
