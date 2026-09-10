-- ============================================================
-- Migration 0015: Roll back the unit_price → base_price rename
--
-- Migration 0013 renamed services.unit_price → services.base_price
-- (and invoice_items / quotation_items). The app code, however,
-- still uses `unit_price` everywhere — which causes 400 errors
-- because the column no longer exists.
--
-- To stop the back-and-forth and ship the fix in one move, this
-- migration renames the columns BACK to `unit_price` so the app
-- works without changes.
--
-- Idempotent: every rename is guarded by an IF condition that
-- only runs the rename if the source column exists and the target
-- column does not.
--
-- After running this, the invoice + quotation + service flows will
-- work end-to-end without any further schema migrations.
-- ============================================================

-- 1. services.base_price → services.unit_price (if applicable)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'services' AND column_name = 'base_price'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'services' AND column_name = 'unit_price'
  ) THEN
    ALTER TABLE public.services RENAME COLUMN base_price TO unit_price;
  END IF;
END $$;

-- 2. invoice_items.base_price → invoice_items.unit_price (if applicable)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice_items' AND column_name = 'base_price'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice_items' AND column_name = 'unit_price'
  ) THEN
    ALTER TABLE public.invoice_items RENAME COLUMN base_price TO unit_price;
  END IF;
END $$;

-- 3. quotation_items.base_price → quotation_items.unit_price (if applicable)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotation_items' AND column_name = 'base_price'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotation_items' AND column_name = 'unit_price'
  ) THEN
    ALTER TABLE public.quotation_items RENAME COLUMN base_price TO unit_price;
  END IF;
END $$;

-- 4. Tell PostgREST to refresh its schema cache
NOTIFY pgrst, 'reload schema';

-- 5. Diagnostic
DO $$
DECLARE
  v_services_unit boolean;
  v_services_base boolean;
  v_invoice_items_unit boolean;
  v_quotation_items_unit boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='services' AND column_name='unit_price'
  ) INTO v_services_unit;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='services' AND column_name='base_price'
  ) INTO v_services_base;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoice_items' AND column_name='unit_price'
  ) INTO v_invoice_items_unit;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='quotation_items' AND column_name='unit_price'
  ) INTO v_quotation_items_unit;
  RAISE NOTICE 'DIAG-0015: services.unit_price=%, services.base_price (should be false)=%, invoice_items.unit_price=%, quotation_items.unit_price=%',
    v_services_unit, v_services_base, v_invoice_items_unit, v_quotation_items_unit;
END $$;