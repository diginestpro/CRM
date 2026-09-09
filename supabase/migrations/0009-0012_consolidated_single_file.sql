-- ============================================================
-- 0009_to_0012_single_run.sql
--
-- CONSOLIDATED single-file migration. Combines everything from
-- migrations 0009_payment_idempotency_fix, 0010_team_invite_fixes,
-- 0011_branding_and_client_project, and 0012_consolidated_remaining_fixes
-- into ONE file so it can be pasted into the Supabase SQL editor once.
--
-- Every block uses IF NOT EXISTS / CREATE OR REPLACE so it's safe
-- to re-run.
--
-- After running this you should see the NOTICEs:
--   DIAG-0009: invoice_payment_methods.payment_method=t ...
--   DIAG-0010: profiles.email column exists=t ...
--   DIAG-0011: clients.project_name=t, app_settings.brand_name=t ...
--   DIAG-0012: invoice_payment_methods rows=N, invoices=M ...
--
-- ============================================================

-- ============================================================
-- BLOCK 1 / 0009
-- Fix invoice_payment_methods: add payment_method + company_id
-- columns, backfill from legacy method_name. Also add
-- allows_partial_payments + min_payment on invoices.
-- ============================================================

ALTER TABLE public.invoice_payment_methods
    ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.invoice_payment_methods
    ADD COLUMN IF NOT EXISTS payment_method TEXT;

UPDATE public.invoice_payment_methods
SET payment_method = method_name
WHERE payment_method IS NULL
  AND method_name IS NOT NULL;

UPDATE public.invoice_payment_methods AS pm
SET company_id = i.company_id
FROM public.invoices AS i
WHERE pm.invoice_id = i.id
  AND pm.company_id IS NULL
  AND i.company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_payment_methods_invoice_id
  ON public.invoice_payment_methods(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_methods_company_id
  ON public.invoice_payment_methods(company_id)
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_payment_methods_invoice_method
  ON public.invoice_payment_methods(invoice_id, payment_method)
  WHERE payment_method IS NOT NULL;

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS allows_partial_payments BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS min_payment DECIMAL(12, 2) DEFAULT NULL;

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

-- ============================================================
-- BLOCK 2 / 0010
-- Fix profiles: add email column, backfill from auth.users.email.
-- ============================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email TEXT;

UPDATE public.profiles AS p
SET email = u.email
FROM auth.users AS u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');

CREATE INDEX IF NOT EXISTS idx_profiles_company_id_created_at
  ON public.profiles(company_id, created_at);

CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles(email)
  WHERE email IS NOT NULL;

DO $$
DECLARE
    v_has_email          BOOLEAN;
    v_backfilled         INT;
    v_total_profiles     INT;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='profiles'
          AND column_name='email'
    ) INTO v_has_email;

    SELECT COUNT(*) INTO v_backfilled
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.email = u.email;

    SELECT COUNT(*) INTO v_total_profiles FROM public.profiles;

    RAISE NOTICE 'DIAG-0010: profiles.email column exists=%, backfilled (matching auth.users) =%, total profiles=%',
        v_has_email, v_backfilled, v_total_profiles;
END $$;

-- ============================================================
-- BLOCK 3 / 0011
-- Add clients.project_name, app_settings.brand_name,
-- app_settings.company_website.
-- ============================================================

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS project_name TEXT;

ALTER TABLE public.app_settings
    ADD COLUMN IF NOT EXISTS brand_name TEXT;

ALTER TABLE public.app_settings
    ADD COLUMN IF NOT EXISTS company_website TEXT;

DO $$
DECLARE
    v_has_project      BOOLEAN;
    v_has_brand_name   BOOLEAN;
    v_has_company_web  BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='clients'
          AND column_name='project_name'
    ) INTO v_has_project;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='app_settings'
          AND column_name='brand_name'
    ) INTO v_has_brand_name;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='app_settings'
          AND column_name='company_website'
    ) INTO v_has_company_web;

    RAISE NOTICE 'DIAG-0011: clients.project_name=%, app_settings.brand_name=%, app_settings.company_website=%',
        v_has_project, v_has_brand_name, v_has_company_web;
END $$;

-- ============================================================
-- BLOCK 4 / 0012
-- Backfill invoice_payment_methods for every existing invoice
-- (this is what makes the per-invoice gateway picker actually
-- drive /pay/[id]). Harden get_my_company_id. Re-assert
-- invoices.status CHECK. Verification.
-- ============================================================

-- 4a. Backfill invoice_payment_methods
DO $$
DECLARE
    v_inserted INT := 0;
BEGIN
    INSERT INTO public.invoice_payment_methods (
        invoice_id, company_id, payment_method, created_at
    )
    SELECT
        i.id,
        i.company_id,
        pg.gateway_name,
        NOW()
    FROM public.invoices i
    JOIN public.payment_gateways pg
      ON pg.company_id = i.company_id
     AND pg.is_active = TRUE
    LEFT JOIN public.clients c
      ON c.id = i.client_id
    WHERE i.company_id IS NOT NULL
      AND i.id NOT IN (SELECT invoice_id FROM public.invoice_payment_methods
                       WHERE invoice_id IS NOT NULL)
      AND (
            c.allowed_gateways IS NULL
         OR c.allowed_gateways = '{}'::text[]
         OR pg.gateway_name = ANY (c.allowed_gateways)
          );

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RAISE NOTICE '0012: backfilled % invoice_payment_methods rows', v_inserted;
END $$;

-- 4b. Harden get_my_company_id
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_company UUID;
    v_meta JSONB;
BEGIN
    BEGIN
        EXECUTE 'SELECT company_id FROM public.company_users WHERE user_id = $1 LIMIT 1'
          INTO v_company USING auth.uid();
        IF v_company IS NOT NULL THEN RETURN v_company; END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'profiles'
          AND column_name = 'company_id'
    ) THEN
        EXECUTE 'SELECT company_id FROM public.profiles WHERE id = $1 LIMIT 1'
          INTO v_company USING auth.uid();
        IF v_company IS NOT NULL THEN RETURN v_company; END IF;
    END IF;

    BEGIN
        EXECUTE 'SELECT raw_user_meta_data FROM auth.users WHERE id = $1'
          INTO v_meta USING auth.uid();
        IF v_meta IS NOT NULL AND v_meta ? 'company_id' THEN
            v_company := (v_meta->>'company_id')::uuid;
            IF v_company IS NOT NULL THEN RETURN v_company; END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_company_id() TO authenticated, anon;

-- 4c. Defensive RLS + indexes for invoice_payment_methods
ALTER TABLE public.invoice_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invoice Payment Methods Access" ON public.invoice_payment_methods;
CREATE POLICY "Invoice Payment Methods Access"
  ON public.invoice_payment_methods FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Public Invoice Payment Methods View" ON public.invoice_payment_methods;
CREATE POLICY "Public Invoice Payment Methods View"
  ON public.invoice_payment_methods FOR SELECT TO anon, authenticated
  USING (true);

-- 4d. Re-assert invoices.status CHECK (allow Partial, Cancelled)
DO $$
BEGIN
    ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_status_check
      CHECK (status IN ('Draft', 'Unpaid', 'Sent', 'Partial', 'Paid', 'Overdue', 'Cancelled'));
    UPDATE public.invoices
       SET status = 'Unpaid'
     WHERE status IS NOT NULL
       AND status NOT IN ('Draft', 'Unpaid', 'Sent', 'Partial', 'Paid', 'Overdue', 'Cancelled');
END $$;

-- 4e. Verification
DO $$
DECLARE
    v_total_pm_rows   INT;
    v_total_invoices  INT;
    v_helper_ok       BOOLEAN;
    v_constraint_ok   BOOLEAN;
BEGIN
    SELECT COUNT(*) INTO v_total_pm_rows FROM public.invoice_payment_methods;
    SELECT COUNT(*) INTO v_total_invoices FROM public.invoices;
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_my_company_id'
    ) INTO v_helper_ok;
    SELECT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'invoices_status_check'
    ) INTO v_constraint_ok;
    RAISE NOTICE 'DIAG-0012: invoice_payment_methods rows=%, invoices=%, helper get_my_company_id=%, invoices_status_check=%',
        v_total_pm_rows, v_total_invoices, v_helper_ok, v_constraint_ok;
END $$;

-- ============================================================
-- DONE. After this runs, /pay/[id] should show only the active
-- payment gateways (Stripe stays hidden because is_active=false).
-- Team invites work. Branding auto-updates from app_settings.
-- ============================================================
