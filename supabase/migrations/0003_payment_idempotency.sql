-- ============================================
-- Migration 0003: Payment idempotency
-- ============================================

-- Add a unique partial index to prevent duplicate completed payment_transactions
-- for the same invoice + gateway combination.
CREATE UNIQUE INDEX IF NOT EXISTS payment_txn_completed_unique
  ON public.payment_transactions (invoice_id, gateway)
  WHERE status = 'completed';

-- Optional: backfill gateway_transaction_id for SafePay transactions that have
-- the tracker in raw_response.
UPDATE public.payment_transactions
SET gateway_transaction_id = COALESCE(
  raw_response->'data'->>'tracker',
  raw_response->>'tracker'
)
WHERE gateway = 'safepay'
  AND gateway_transaction_id IS NULL;
