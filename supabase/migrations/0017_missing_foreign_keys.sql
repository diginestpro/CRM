-- ============================================================
-- Migration 0017: add the missing FKs that PostgREST needs for
-- embedded-resource joins.
--
-- Why: the public pay page does:
--   select("*, invoice_items(*, services(name))")
-- and the authed invoice / quotation detail pages do similar joins.
-- PostgREST only follows those nested-resource joins if there is a
-- real FOREIGN KEY constraint on the join column.
--
-- Without the FK the request fails with:
--   PGRST200: Could not find a relationship between
--   'invoice_items' and 'services' in the schema cache
-- and the public route returns a 500, so the pay page shows
-- "Failed to load invoice: {}".
--
-- Both *_items.service_id columns already exist as plain uuid;
-- we only need to add the FK constraints. We use ON DELETE SET NULL
-- so deleting a service doesn't cascade-delete historical line items.
-- ============================================================

-- ------------------------------------------------------------
-- 1. invoice_items.service_id -> services.id
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fk_invoice_items_service_id'
  ) THEN
    ALTER TABLE public.invoice_items
      ADD CONSTRAINT fk_invoice_items_service_id
      FOREIGN KEY (service_id) REFERENCES public.services(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. quotation_items.service_id -> services.id
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fk_quotation_items_service_id'
  ) THEN
    ALTER TABLE public.quotation_items
      ADD CONSTRAINT fk_quotation_items_service_id
      FOREIGN KEY (service_id) REFERENCES public.services(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3. Diagnostic NOTICE
-- ------------------------------------------------------------
DO $$
DECLARE
  v_ii_fk  BOOLEAN;
  v_qi_fk  BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoice_items_service_id'
  ) INTO v_ii_fk;
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_quotation_items_service_id'
  ) INTO v_qi_fk;

  RAISE NOTICE 'DIAG-0017: invoice_items.service_id -> services.id=%, quotation_items.service_id -> services.id=%',
    v_ii_fk, v_qi_fk;
END $$;
