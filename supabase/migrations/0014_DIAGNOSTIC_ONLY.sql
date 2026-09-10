-- ============================================================
-- DIAGNOSTIC ONLY — read this to see all schema mismatches
--
-- This file is purely diagnostic — it does NOT change any tables.
-- Run it in the Supabase SQL Editor and check the "Messages" tab
-- (NOTICE lines) at the bottom to see every column of every table
-- the CRM uses.
--
-- Compare the output to what the app sends:
--   1. Look at "TABLE public.invoices" — every column listed with !
--      is NOT NULL and must always be provided (or have a DEFAULT).
--   2. Compare against the InvoiceForm payload keys.
--
-- Once you've identified missing columns, run migration 0014_fix.sql
-- (or use the fix section at the bottom of migration 0014).
-- ============================================================

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
  RAISE NOTICE '==== CRM SCHEMA DIAGNOSTIC ====';
  RAISE NOTICE 'Format: column_name:data_type[! = NOT NULL]';
  RAISE NOTICE '';
  FOREACH rec IN ARRAY app_uses LOOP
    SELECT string_agg(column_name || ':' || data_type || CASE WHEN is_nullable = 'NO' THEN '!' ELSE '' END, ', ' ORDER BY ordinal_position)
    INTO cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = rec;
    RAISE NOTICE 'TABLE public.% : %', rec, cols;
  END LOOP;
END $$;

-- Specific check: invoice NOT NULL columns that the form must
-- always provide. If any of these are NOT NULL but the form
-- doesn't send them, every insert/update will 400.
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==== INVOICE NOT-NULL CONSTRAINTS ====';
  RAISE NOTICE 'For each NOT NULL column on invoices, the form MUST send a value.';
  FOR r IN
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND is_nullable = 'NO'
      AND column_default IS NULL  -- columns with a DEFAULT are fine
    ORDER BY ordinal_position
  LOOP
    RAISE NOTICE '  invoices.% (%): MUST be set by the form', r.column_name, r.data_type;
  END LOOP;
END $$;
