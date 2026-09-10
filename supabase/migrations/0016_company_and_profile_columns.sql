-- ============================================================
-- Migration 0016: back-fill company + profile columns that
-- exist in the live database but were never recorded in a
-- migration file. They were added by hand via the SQL Editor.
--
-- Running this migration on a fresh database ensures new
-- environments match the current production schema.
--
-- All ALTERs are idempotent (IF NOT EXISTS).
-- ============================================================

-- ------------------------------------------------------------
-- 1. companies: extended address + branding fields
-- ------------------------------------------------------------
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS address      TEXT,
    ADD COLUMN IF NOT EXISTS city         TEXT,
    ADD COLUMN IF NOT EXISTS state        TEXT,
    ADD COLUMN IF NOT EXISTS zip          TEXT,
    ADD COLUMN IF NOT EXISTS country      TEXT,
    ADD COLUMN IF NOT EXISTS tagline      TEXT,
    ADD COLUMN IF NOT EXISTS brand_color  TEXT DEFAULT (chr(35) || '2563eb'::text),
    ADD COLUMN IF NOT EXISTS footer_text  TEXT,
    ADD COLUMN IF NOT EXISTS invoice_template TEXT DEFAULT 'modern'::text;

-- ------------------------------------------------------------
-- 2. profiles: contact info on the user row
-- ------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT;

-- ------------------------------------------------------------
-- 3. Diagnostic NOTICE
-- ------------------------------------------------------------
DO $$
DECLARE
    v_co_address        BOOLEAN;
    v_co_brand_color    BOOLEAN;
    v_co_invoice_tpl    BOOLEAN;
    v_pr_email          BOOLEAN;
    v_pr_phone          BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='companies' AND column_name='address')
        INTO v_co_address;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='companies' AND column_name='brand_color')
        INTO v_co_brand_color;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='companies' AND column_name='invoice_template')
        INTO v_co_invoice_tpl;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='profiles' AND column_name='email')
        INTO v_pr_email;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='profiles' AND column_name='phone')
        INTO v_pr_phone;

    RAISE NOTICE 'DIAG-0016: companies.address=%, companies.brand_color=%, companies.invoice_template=%, profiles.email=%, profiles.phone=%',
        v_co_address, v_co_brand_color, v_co_invoice_tpl, v_pr_email, v_pr_phone;
END $$;
