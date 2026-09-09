-- ============================================================
-- 0009_invoice_payment_methods_fix.sql
--
-- Two fixes in one migration:
--
-- 1) The application code reads / writes column "payment_method"
--    on public.invoice_payment_methods, but the table actually
--    defines column "method_name".  Result: rows weren't being
--    saved (silently), and the pay page was always falling back to
--    the default gateway list (["stripe","paypal","safepay"]) since
--    reads returned [].
--
--    We add the missing columns the code expects (payment_method +
--    company_id, both nullable) and backfill from the legacy
--    method_name where applicable.
--
-- 2) Add per-invoice partial-payment controls so the user can lock
--    the pay amount to "must pay full remaining" or allow partial
--    payments above a minimum threshold.
-- ============================================================

-- --- 1) Reshape invoice_payment_methods ----------------------------

ALTER TABLE public.invoice_payment_methods
    ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.invoice_payment_methods
    ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Backfill: if anyone has legacy method_name rows, mirror into
-- payment_method so the app sees them.
UPDATE public.invoice_payment_methods
SET payment_method = method_name
WHERE payment_method IS NULL
  AND method_name IS NOT NULL;

-- Backfill company_id from the parent invoice (best effort).
UPDATE public.invoice_payment_methods AS pm
SET company_id = i.company_id
FROM public.invoices AS i
WHERE pm.invoice_id = i.id
  AND pm.company_id IS NULL
  AND i.company_id IS NOT NULL;

-- Helpful indexes for the joins the app does.
CREATE INDEX IF NOT EXISTS idx_invoice_payment_methods_invoice_id
    ON public.invoice_payment_methods(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_methods_company_id
    ON public.invoice_payment_methods(company_id)
    WHERE company_id IS NOT NULL;

-- Add the unique partial index that prevents the same gateway from
-- being inserted twice on the same invoice (idempotency).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_payment_methods_invoice_method
    ON public.invoice_payment_methods(invoice_id, payment_method)
    WHERE payment_method IS NOT NULL;

-- --- 2) Per-invoice partial-payment controls ------------------------

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS allows_partial_payments BOOLEAN NOT NULL DEFAULT false;

-- Minimum payment amount when partial is allowed. NULL means "any
-- positive amount up to remaining is acceptable".
ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS min_payment DECIMAL(12, 2) DEFAULT NULL;

-- --- 3) Verification NOTICE -----------------------------------------

DO $$
DECLARE
    v_has_payment_method      BOOLEAN;
    v_has_company_id          BOOLEAN;
    v_has_allows_partial      BOOLEAN;
    v_total_pm                INT;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='invoice_payment_methods'
          AND column_name='payment_method'
    ) INTO v_has_payment_method;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='invoice_payment_methods'
          AND column_name='company_id'
    ) INTO v_has_company_id;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='invoices'
          AND column_name='allows_partial_payments'
    ) INTO v_has_allows_partial;

    SELECT COUNT(*) INTO v_total_pm FROM public.invoice_payment_methods;

    RAISE NOTICE 'DIAG-0009: invoice_payment_methods.payment_method=%, invoice_payment_methods.company_id=%, invoices.allows_partial_payments=%, invoice_payment_methods rows=%',
        v_has_payment_method, v_has_company_id, v_has_allows_partial, v_total_pm;
END $$;
