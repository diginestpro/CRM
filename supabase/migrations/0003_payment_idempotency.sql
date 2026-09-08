-- ============================================
-- Migration 0003: Payment idempotency
-- ============================================

-- The payment_transactions table has a gateway_transaction_id column
-- (TEXT) which stores the SafePay tracker or order_id.
-- Use it as the dedupe key.

-- 1. Create a unique partial index on (invoice_id, gateway_transaction_id)
--    WHERE status = completed. This prevents the webhook from inserting
--    duplicate completed rows for the same invoice.
CREATE UNIQUE INDEX IF NOT EXISTS payment_txn_completed_unique
  ON public.payment_transactions (invoice_id, gateway_transaction_id)
  WHERE status = 'completed' AND gateway_transaction_id IS NOT NULL;

-- 2. Backfill gateway_transaction_id for SafePay rows that have the
--    tracker in raw_response but did not get it stored.
UPDATE public.payment_transactions
SET gateway_transaction_id = COALESCE(
  raw_response->'data'->>'tracker',
  raw_response->>'tracker',
  raw_response->'data'->>'order_id',
  raw_response->>'order_id'
)
WHERE gateway_transaction_id IS NULL
  AND (
    raw_response ? 'tracker'
    OR raw_response->'data' ? 'tracker'
    OR raw_response ? 'order_id'
  );
