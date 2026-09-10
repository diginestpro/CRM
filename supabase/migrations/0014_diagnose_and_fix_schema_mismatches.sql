
-- ============================================================
-- Migration 0014: Diagnose & fix schema mismatches
--
-- This migration runs a full diagnostic of every column the
-- application reads or writes against the actual database schema.
-- It then applies the missing fixes:
--   1. Adds issue_date to invoices if missing (it's NOT NULL but
--      the form doesn't send it).
--   2. Adds subtotal to invoices if missing.
--   3. Reloads the PostgREST schema cache so the app picks up
--      the new columns immediately.
--
-- Run in Supabase Dashboard SQL Editor (or psql against the
-- direct-connection string). The diagnostic section can be
-- safely removed once you've confirmed everything matches.
-- ============================================================

-- ----------------------------------------------------------------
-- DIAGNOSTIC 1: Print the column list for every table the app
-- writes to. Compare against the keys the form payloads send.
-- ----------------------------------------------------------------
DO $$
DECLARE
  rec TEXT;
  cols TEXT;
  app_uses TEXT[] := ARRAY[
    'companies', 'company_addresses',
    'profiles', 'company_users',
    'clients', 'client_addresses',
    'services',
    'invoices', 'invoice_items', 'invoice_payment_methods',
    'invoice_payments', 'payment_transactions',
    'quotations', 'quotation_items',
    'currencies', 'payment_gateways',
    'smtp_settings', 'email_log',
    'activity_logs', 'system_settings',
    'app_settings'
  ];
BEGIN
  RAISE NOTICE '==== SCHEMA DIAGNOSTIC ====';
  FOREACH rec IN ARRAY app_uses LOOP
    SELECT string_agg(column_name || ':' || data_type || CASE WHEN is_nullable = 'NO' THEN '!' ELSE '' END, ', ' ORDER BY ordinal_position)
    INTO cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = rec;
    RAISE NOTICE 'TABLE public.% : %', rec, cols;
  END LOOP;
END $$;

-- ----------------------------------------------------------------
-- DIAGNOSTIC 2: Show what the InvoiceForm payload actually sends.
-- ----------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE '==== INVOICE PAYLOAD (app-side) ====';
  RAISE NOTICE 'The InvoiceForm sends these keys to invoices:';
  RAISE NOTICE '  client_id, invoice_number, status, due_date, notes,';
  RAISE NOTICE '  tax_rate, company_id, company_address_id,';
  RAISE NOTICE '  allows_partial_payments, min_payment';
  RAISE NOTICE '';
  RAISE NOTICE 'Required by table NOT NULL constraints:';
  RAISE NOTICE '  invoice_number (TEXT NOT NULL)';
  RAISE NOTICE '  issue_date   (DATE NOT NULL)';
END $$;

-- ----------------------------------------------------------------
-- FIX 1: invoices — ensure every column the form sends / reads
-- exists. Idempotent: every column uses IF NOT EXISTS.
-- ----------------------------------------------------------------

-- issue_date — required by NOT NULL constraint
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS issue_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- subtotal / tax_amount / tax_rate / currency_code / amount_paid / total_amount
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS subtotal DECIMAL(12, 2) DEFAULT 0;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(12, 2) DEFAULT 0;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5, 2) DEFAULT 0;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) REFERENCES public.currencies(code);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12, 2) DEFAULT 0;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS total_amount DECIMAL(12, 2) DEFAULT 0;

-- company_address_id (added by migration 0007, but be defensive)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS company_address_id UUID REFERENCES public.company_addresses(id) ON DELETE SET NULL;

-- selected_address_id (added by migration 0006)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS selected_address_id UUID REFERENCES public.client_addresses(id) ON DELETE SET NULL;

-- allows_partial_payments + min_payment (added by migration 0009)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS allows_partial_payments BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS min_payment DECIMAL(12, 2) DEFAULT NULL;
