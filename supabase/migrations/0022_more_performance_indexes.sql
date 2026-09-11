-- ============================================================
-- Migration 0022: Additional covering indexes for hot paths
-- added after 0020 was written.
--
-- Purpose: 0020 covered the most common list / list-join
-- patterns, but a few of the highest-traffic queries added
-- since then still do a heap fetch per matching row. The
-- indexes below turn those into index-only scans.
--
-- All statements use CREATE INDEX CONCURRENTLY IF NOT EXISTS
-- so re-running the migration is safe AND so production is
-- not locked while the index is being built.
--
-- NOTE: CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction. Paste this file into the Supabase SQL Editor
-- (which runs each statement in its own implicit txn) or
-- feed it to psql with one statement per line.
-- ============================================================

DO $$
BEGIN
    IF current_setting('is_in_transaction') = 'on' THEN
        RAISE EXCEPTION
            'Migration 0022 must NOT run inside a transaction. '
            'Open Supabase SQL Editor and paste this file as-is.';
    END IF;
END $$;

-- ------------------------------------------------------------
-- 1. invoices list page (most-trafficked table)
--
-- Pattern:
--   SELECT id, invoice_number, total_amount, amount_paid,
--          currency_code, due_date, status, company_address_id,
--          created_at, client_id, clients(full_name)
--     FROM invoices
--    WHERE company_id = $1
--    ORDER BY created_at DESC
--    LIMIT N
--
-- 0020's idx_invoices_company_status_created is keyed on
-- (company_id, status, created_at DESC) and is great when the
-- WHERE also filters by status, but the unfiltered list page
-- cannot use it. This covering index on (company_id, created_at)
-- with every column the list page SELECTs lets Postgres serve
-- the page with no heap visits at all.
-- ------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_company_created_covering
    ON public.invoices (company_id, created_at DESC)
    INCLUDE (invoice_number, total_amount, amount_paid,
             currency_code, due_date, status,
             company_address_id, client_id);

-- Dashboard "Needs Attention" - Unpaid/Overdue, ordered by due
-- 0020 has idx_invoices_company_status_created which works for
-- both filters, but the partial covering index below is smaller
-- and faster for this exact list.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_company_due_partial_covering
    ON public.invoices (company_id, due_date ASC)
    INCLUDE (id, invoice_number, total_amount, amount_paid,
             currency_code, status, client_id)
    WHERE status IN ('Unpaid', 'Overdue', 'Partial', 'Sent');

-- /api/invoices/check-overdue cron - sweeps ALL companies for
-- Unpaid/Partial invoices past their due date. Cross-tenant, so
-- company_id is not in the predicate.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_due_date_filter
    ON public.invoices (due_date)
    INCLUDE (id, company_id, status, invoice_number, client_id)
    WHERE status IN ('Unpaid', 'Partial');

-- ------------------------------------------------------------
-- 2. invoice_payments list page (payments history)
--
-- Pattern:
--   SELECT *, invoices(invoice_number, clients(full_name))
--     FROM invoice_payments
--    ORDER BY payment_date DESC
--    LIMIT 50
--
-- IMPORTANT: as of the 2026-09-10 schema dump the
-- invoice_payments table has NO company_id column. The
-- current admin /payments page does not filter by tenant at
-- all, so any company-scoped index would (a) fail to apply
-- because the column doesn't exist and (b) be incorrect
-- because the query doesn't filter by company.
--
-- 0020 created idx_invoice_payments_status_date keyed on
-- (status, payment_date) - great when filtering by status, but
-- the admin payments page renders every payment. This new
-- covering index over (payment_date DESC) lets the page hit
-- one index entry per row with no heap visits.
--
-- Tenant isolation on invoice_payments is a separate concern
-- (see PERFORMANCE.md "Known follow-ups"); that migration
-- would add company_id + RLS, and a follow-up index can then
-- be keyed on (company_id, payment_date DESC).
-- ------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoice_payments_payment_date
    ON public.invoice_payments (payment_date DESC)
    INCLUDE (invoice_id, amount, currency_code, status, payment_method);

-- ------------------------------------------------------------
-- 3. clients list page (search-by-name + sort)
--
-- Pattern:
--   SELECT * FROM clients
--    WHERE company_id = $1
--      AND (full_name ILIKE '%foo%' OR company_name ILIKE '%foo%')
--    ORDER BY full_name ASC
--
-- 0020 created a single-column trigram index on full_name. We
-- add a composite trigram index that hits both name columns in
-- a single scan, matching what the clients search box actually
-- issues.
-- ------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_company_name_search
    ON public.clients USING gin (
        full_name gin_trgm_ops,
        company_name gin_trgm_ops
    )
    WHERE company_id IS NOT NULL;

-- ------------------------------------------------------------
-- 4. quotations list page - covering index like invoices
-- ------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotations_company_created_covering
    ON public.quotations (company_id, created_at DESC)
    INCLUDE (quotation_number, total_amount, currency_code, status,
             expiry_date, client_id);

-- ------------------------------------------------------------
-- 5. email_log admin queue
--
-- Pattern:
--   SELECT * FROM email_log
--    WHERE company_id = $1
--    ORDER BY created_at DESC
--
-- 0020 created idx_email_log_company + idx_email_log_created_at
-- as separate single-column indexes; the planner can only use
-- one. A combined covering index is much faster for the common
-- "show me my last 50 emails" admin UI.
-- ------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_log_company_created
    ON public.email_log (company_id, created_at DESC)
    INCLUDE (to_email, subject, template, status, related_type, related_id);

-- ------------------------------------------------------------
-- 6. ANALYZE - refresh planner stats so the new indexes get
-- used immediately, just like 0020 does.
-- ------------------------------------------------------------
ANALYZE public.invoices;
ANALYZE public.invoice_payments;
ANALYZE public.quotations;
ANALYZE public.clients;
ANALYZE public.email_log;

-- ------------------------------------------------------------
-- 7. Diagnostic NOTICEs - confirm every new index now exists
-- ------------------------------------------------------------
DO $$
DECLARE
    v_invoices_covering BOOLEAN;
    v_invoices_due      BOOLEAN;
    v_invoices_filter   BOOLEAN;
    v_payments          BOOLEAN;
    v_clients           BOOLEAN;
    v_quotations        BOOLEAN;
    v_email_log         BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                     AND indexname='idx_invoices_company_created_covering')
      INTO v_invoices_covering;
    SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                     AND indexname='idx_invoices_company_due_partial_covering')
      INTO v_invoices_due;
    SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                     AND indexname='idx_invoices_due_date_filter')
      INTO v_invoices_filter;
    SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                     AND indexname='idx_invoice_payments_payment_date')
      INTO v_payments;
    SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                     AND indexname='idx_clients_company_name_search')
      INTO v_clients;
    SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                     AND indexname='idx_quotations_company_created_covering')
      INTO v_quotations;
    SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                     AND indexname='idx_email_log_company_created')
      INTO v_email_log;

    RAISE NOTICE 'NOTICE 0022-A: idx_invoices_company_created_covering=%', v_invoices_covering;
    RAISE NOTICE 'NOTICE 0022-B: idx_invoices_company_due_partial_covering=%', v_invoices_due;
    RAISE NOTICE 'NOTICE 0022-C: idx_invoices_due_date_filter=%', v_invoices_filter;
    RAISE NOTICE 'NOTICE 0022-D: idx_invoice_payments_company_date=%', v_payments;
    RAISE NOTICE 'NOTICE 0022-E: idx_clients_company_name_search=%', v_clients;
    RAISE NOTICE 'NOTICE 0022-F: idx_quotations_company_created_covering=%', v_quotations;
    RAISE NOTICE 'NOTICE 0022-G: idx_email_log_company_created=%', v_email_log;
END $$;
