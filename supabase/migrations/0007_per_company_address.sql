-- ============================================================
-- 0007_per_company_address.sql
--
-- Goal:
--   Each company can have multiple "office" addresses (USA, Pakistan,
--   UK, UAE, ...) in public.company_addresses. We now let a user pick
--   ONE of those addresses per invoice (and per quotation) so the
--   printed / emailed / shared invoice shows the correct office in
--   the "From" block. The choice is per-invoice / per-quotation —
--   picking USA on invoice #1 does NOT cascade to invoice #2.
--
-- What this migration does:
--   1. Adds company_address_id columns on invoices + quotations.
--   2. Backfills them idempotently: existing rows pick their company's
--      default address (or first address) so legacy data renders sensibly.
--   3. Ensures the new columns are reachable by RLS policies already
--      in place (the policies on invoices/quotations already gate by
--      company_id, no change needed).
-- ============================================================

-- 1) New column on invoices: which company office should appear in
--    the "From" block of THIS invoice? Nullable — when null we fall
--    back to the company's default company_addresses row (or, last
--    resort, the top-level companies.address columns).
ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS company_address_id UUID
    REFERENCES public.company_addresses(id) ON DELETE SET NULL;

ALTER TABLE public.quotations
    ADD COLUMN IF NOT EXISTS company_address_id UUID
    REFERENCES public.company_addresses(id) ON DELETE SET NULL;

-- Helpful indexes for the joins the app does on the detail page.
CREATE INDEX IF NOT EXISTS idx_invoices_company_address_id
    ON public.invoices(company_address_id)
    WHERE company_address_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_company_address_id
    ON public.quotations(company_address_id)
    WHERE company_address_id IS NOT NULL;

-- 2) Backfill any existing invoice / quotation that does not yet have
--    a chosen address — give it the company's default address (or the
--    first address that exists). This is wrapped in a CTE so it stays
--    idempotent: if company_address_id is already set, we leave it.
DO $$
DECLARE
    v_updated_invoices    INT := 0;
    v_updated_quotations  INT := 0;
BEGIN
    -- INVOICES ---------------------------------------------------------
    WITH candidates AS (
        SELECT
            i.id AS invoice_id,
            (
                SELECT ca.id
                FROM public.company_addresses ca
                WHERE ca.company_id = i.company_id
                ORDER BY ca.is_default DESC NULLS LAST, ca.created_at ASC
                LIMIT 1
            ) AS default_addr_id
        FROM public.invoices i
        WHERE i.company_address_id IS NULL
    ),
    ranked AS (
        SELECT
            invoice_id,
            default_addr_id,
            ROW_NUMBER() OVER (PARTITION BY invoice_id ORDER BY default_addr_id NULLS LAST) AS rn
        FROM candidates
        WHERE default_addr_id IS NOT NULL
    )
    UPDATE public.invoices i
    SET company_address_id = ranked.default_addr_id
    FROM ranked
    WHERE i.id = ranked.invoice_id
      AND ranked.rn = 1;
    GET DIAGNOSTICS v_updated_invoices = ROW_COUNT;
    RAISE NOTICE '0007: backfilled % invoices with default company_address_id', v_updated_invoices;

    -- QUOTATIONS -------------------------------------------------------
    WITH candidates AS (
        SELECT
            q.id AS quotation_id,
            (
                SELECT ca.id
                FROM public.company_addresses ca
                WHERE ca.company_id = q.company_id
                ORDER BY ca.is_default DESC NULLS LAST, ca.created_at ASC
                LIMIT 1
            ) AS default_addr_id
        FROM public.quotations q
        WHERE q.company_address_id IS NULL
    ),
    ranked AS (
        SELECT
            quotation_id,
            default_addr_id,
            ROW_NUMBER() OVER (PARTITION BY quotation_id ORDER BY default_addr_id NULLS LAST) AS rn
        FROM candidates
        WHERE default_addr_id IS NOT NULL
    )
    UPDATE public.quotations q
    SET company_address_id = ranked.default_addr_id
    FROM ranked
    WHERE q.id = ranked.quotation_id
      AND ranked.rn = 1;
    GET DIAGNOSTICS v_updated_quotations = ROW_COUNT;
    RAISE NOTICE '0007: backfilled % quotations with default company_address_id', v_updated_quotations;
END $$;

-- 3) RLS — companies and company_addresses already have policies keyed
--    on company_id = get_my_company_id(); invoices/quotations policies
--    ALSO operate by company_id. So a user in the same company can
--    read/write company_address_id freely. No policy changes required.

-- 4) Verification NOTICE — the user can paste this back to confirm.
DO $$
DECLARE
    v_invoices_addr    BOOLEAN;
    v_quotations_addr  BOOLEAN;
    v_total_addr       INT;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='invoices'
          AND column_name='company_address_id'
    ) INTO v_invoices_addr;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='quotations'
          AND column_name='company_address_id'
    ) INTO v_quotations_addr;

    SELECT COUNT(*) INTO v_total_addr FROM public.company_addresses;

    RAISE NOTICE 'DIAG-0007: invoices.company_address_id=%, quotations.company_address_id=%, company_addresses rows=%',
        v_invoices_addr, v_quotations_addr, v_total_addr;
END $$;
