-- ============================================================
-- Migration 0013: Fix schema mismatches caught in production
--
-- This migration fixes column-name mismatches between the application
-- and the database that caused POST/PATCH requests to return 400
-- (Bad Request) with errors like "Could not find the column ... in
-- the schema cache".
--
-- Run once. Idempotent: every change is guarded by `IF [NOT] EXISTS`.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Rename services.unit_price → services.base_price
--    The frontend uses `base_price` everywhere (form fields, services
--    table, billing-items handler) but the DB column was `unit_price`.
-- ----------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'services' AND column_name = 'unit_price'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'services' AND column_name = 'base_price'
  ) THEN
    ALTER TABLE public.services RENAME COLUMN unit_price TO base_price;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 2. Rename invoice_items.unit_price → invoice_items.base_price
-- ----------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice_items' AND column_name = 'unit_price'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice_items' AND column_name = 'base_price'
  ) THEN
    ALTER TABLE public.invoice_items RENAME COLUMN unit_price TO base_price;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 3. Rename quotation_items.unit_price → quotation_items.base_price
-- ----------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotation_items' AND column_name = 'unit_price'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotation_items' AND column_name = 'base_price'
  ) THEN
    ALTER TABLE public.quotation_items RENAME COLUMN unit_price TO base_price;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 4. Defensive: notify PostgREST that the schema changed so the
--    next request sees the renamed columns immediately. Without this,
--    PostgREST may keep serving the old schema from its in-memory
--    cache for up to a few minutes.
-- ----------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------
-- 5. Diagnostic
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_services_base boolean;
  v_services_unit boolean;
  v_invoice_items_base boolean;
  v_quotation_items_base boolean;
  v_quotation_items_unit boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='services' AND column_name='base_price'
  ) INTO v_services_base;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='services' AND column_name='unit_price'
  ) INTO v_services_unit;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoice_items' AND column_name='base_price'
  ) INTO v_invoice_items_base;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='quotation_items' AND column_name='base_price'
  ) INTO v_quotation_items_base;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='quotation_items' AND column_name='unit_price'
  ) INTO v_quotation_items_unit;
  RAISE NOTICE 'DIAG-0013: services.base_price=%, services.unit_price (should be false)=%, invoice_items.base_price=%, quotation_items.base_price=%, quotation_items.unit_price (should be false)=%',
    v_services_base, v_services_unit, v_invoice_items_base, v_quotation_items_base, v_quotation_items_unit;
END $$;