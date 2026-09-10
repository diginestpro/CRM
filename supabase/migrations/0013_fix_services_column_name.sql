-- ============================================================
-- Migration 0013: Fix services.unit_price → services.base_price
--
-- The frontend uses `base_price` everywhere (form fields, services
-- table, billing-items handler, etc.) but the database column was
-- originally named `unit_price`. This caused a 400 Bad Request every
-- time the app tried to read or write that column, because the
-- PostgREST schema cache rejected the unknown column name.
--
-- We rename the column and update the related invoice_items column
-- so the data stays consistent. Safe to run on existing data: the
-- rename copies the existing values.
-- ============================================================

-- 1. Rename services.unit_price → services.base_price
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

-- 2. Rename invoice_items.unit_price → invoice_items.base_price
-- (keeps the two tables symmetric; both fields show the same value).
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

-- 3. Rename quotation_items.unit_price → quotation_items.base_price
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

-- 4. Diagnostic
DO $$
DECLARE
  v_services_base boolean;
  v_services_unit boolean;
  v_invoice_items_base boolean;
  v_quotation_items_base boolean;
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
  RAISE NOTICE 'DIAG-0013: services.base_price=%, services.unit_price (should be false)=%, invoice_items.base_price=%, quotation_items.base_price=%',
    v_services_base, v_services_unit, v_invoice_items_base, v_quotation_items_base;
END $$;