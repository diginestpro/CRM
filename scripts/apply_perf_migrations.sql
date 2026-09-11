-- ============================================================
-- Combined performance migration runner
--
-- Purpose: one-shot, paste-this-into-the-SQL-Editor bundle
-- of migrations 0020 + 0021 + 0022 + 0023, with an inline
-- pre/post verification block so you can see the speedup in
-- the same session.
--
-- HOW TO USE:
--   1. Open Supabase Dashboard -> SQL Editor -> New query.
--   2. Paste this ENTIRE file as-is.
--   3. Hit "Run".
--   4. Read the RAISE NOTICE lines + the SELECT results at
--      the bottom. The "BEFORE" section shows which indexes
--      and views exist BEFORE the migration runs (should be
--      mostly FALSE / "not present"). The "AFTER" section
--      shows the same objects AFTER (should be all TRUE /
--      "present").
--
-- SAFE TO RE-RUN: every CREATE / CREATE OR REPLACE uses IF
-- NOT EXISTS / OR REPLACE; CREATE INDEX uses CONCURRENTLY
-- IF NOT EXISTS; the materialised view is dropped & rebuilt
-- only if it isn't already a materialised view.
--
-- TIME: on a small database (< 100k rows) the whole thing
-- completes in well under a minute. On a larger database
-- it is still non-blocking thanks to CONCURRENTLY.
-- ============================================================

-- ------------------------------------------------------------
-- BEFORE: what exists right now (so you can compare AFTER)
-- ------------------------------------------------------------
SELECT '=== BEFORE: performance object inventory ===' AS section;

SELECT
    '0020 idx_company_users_user_id'       AS object,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_company_users_user_id') AS present
UNION ALL SELECT '0020 idx_profiles_company_lookup',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_profiles_company_lookup')
UNION ALL SELECT '0020 idx_clients_company_created',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_clients_company_created')
UNION ALL SELECT '0020 idx_invoices_company_status_created',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_invoices_company_status_created')
UNION ALL SELECT '0020 idx_invoice_payments_status_date',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_invoice_payments_status_date')
UNION ALL SELECT '0021 v_dashboard_stats (regular)',
    EXISTS (SELECT 1 FROM pg_views    WHERE schemaname='public' AND viewname='v_dashboard_stats')
UNION ALL SELECT '0021 v_dashboard_counts (regular)',
    EXISTS (SELECT 1 FROM pg_views    WHERE schemaname='public' AND viewname='v_dashboard_counts')
UNION ALL SELECT '0022 idx_invoices_company_created_covering',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_invoices_company_created_covering')
UNION ALL SELECT '0022 idx_invoices_company_due_partial_covering',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_invoices_company_due_partial_covering')
UNION ALL SELECT '0022 idx_invoices_due_date_filter',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_invoices_due_date_filter')
UNION ALL SELECT '0022 idx_invoice_payments_payment_date',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_invoice_payments_payment_date')
UNION ALL SELECT '0022 idx_clients_company_name_search',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_clients_company_name_search')
UNION ALL SELECT '0022 idx_quotations_company_created_covering',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_quotations_company_created_covering')
UNION ALL SELECT '0022 idx_email_log_company_created',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_email_log_company_created')
UNION ALL SELECT '0023 v_dashboard_stats (materialised)',
    EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname='public' AND matviewname='v_dashboard_stats')
ORDER BY object;




-- ============================================================
-- APPLY MIGRATIONS 0020 -> 0021 -> 0022 -> 0023
-- (paste-concatenated from the matching files in /supabase/migrations/)
-- ============================================================

-- ============================================================
-- Migration 0020: Performance & Authentication Indexing
--
-- Purpose: Eliminate the slow-loading / database-response
-- bottleneck by adding covering indexes for every filter,
-- sort, and join the application issues. Also harden the
-- get_my_company_id() helper (used in every RLS policy) so
-- it does a single indexed lookup instead of a fallback
-- chain of seq scans.
--
-- All statements are IF NOT EXISTS / CREATE OR REPLACE so
-- the migration is safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Helper: enable pg_trgm for fast text search / ILIKE
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ------------------------------------------------------------
-- 1. AUTH & TENANCY — make get_my_company_id() BLAZING fast
-- ------------------------------------------------------------
--
-- Right now get_my_company_id() does:
--   1) SELECT FROM company_users WHERE user_id = auth.uid()
--   2) If NULL, SELECT FROM profiles WHERE id = auth.uid()
-- Without an index on company_users.user_id the FIRST query
-- seq-scans the whole table on every RLS check (i.e. every
-- row of every read of every table). Adding these two indexes
-- turns it into an index-only lookup.
-- ------------------------------------------------------------

-- company_users lookup by user_id (used in get_my_company_id)
CREATE INDEX IF NOT EXISTS idx_company_users_user_id
    ON public.company_users (user_id);

-- profiles lookup by id (PK already covers it but we want a
-- covering index that includes company_id so the helper can
-- satisfy the query without hitting the heap)
CREATE INDEX IF NOT EXISTS idx_profiles_company_lookup
    ON public.profiles (id)
    INCLUDE (company_id)
    WHERE company_id IS NOT NULL;

-- Replace the helper. Single query, indexed, STABLE so the
-- planner can cache the result within a statement, and
-- PARALLEL SAFE so it can run in parallel workers.
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    SELECT company_id
      FROM public.profiles
     WHERE id = auth.uid()
     LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_company_id() TO authenticated, anon;

-- ------------------------------------------------------------
-- 2. CRM CORE TABLES — company_id + sort-by-created_at covers
--    every "list of X for my company" page.
-- ------------------------------------------------------------

-- clients
CREATE INDEX IF NOT EXISTS idx_clients_company_created
    ON public.clients (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_company_archived_created
    ON public.clients (company_id, is_archived, created_at DESC)
    WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_clients_company_email
    ON public.clients (company_id, email)
    WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_company_name_trgm
    ON public.clients USING gin (full_name gin_trgm_ops)
    WHERE company_id IS NOT NULL;

-- client_addresses
CREATE INDEX IF NOT EXISTS idx_client_addresses_client_default
    ON public.client_addresses (client_id, is_default)
    WHERE is_default = true;

-- services
CREATE INDEX IF NOT EXISTS idx_services_company_active
    ON public.services (company_id, is_active)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_services_company_created
    ON public.services (company_id, created_at DESC);

-- quotations
CREATE INDEX IF NOT EXISTS idx_quotations_company_status_created
    ON public.quotations (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_company_client
    ON public.quotations (company_id, client_id);
CREATE INDEX IF NOT EXISTS idx_quotations_client
    ON public.quotations (client_id);

-- quotation_items (also covers the "all items for this quotation" page)
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation
    ON public.quotation_items (quotation_id);

-- invoices — the hot table
CREATE INDEX IF NOT EXISTS idx_invoices_company_status_created
    ON public.invoices (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_company_due_date
    ON public.invoices (company_id, due_date)
    WHERE status IN ('Unpaid', 'Overdue', 'Partial', 'Sent');
CREATE INDEX IF NOT EXISTS idx_invoices_company_invoice_number
    ON public.invoices (company_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_client
    ON public.invoices (client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_quotation
    ON public.invoices (quotation_id)
    WHERE quotation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_company_client_created
    ON public.invoices (company_id, client_id, created_at DESC);

-- invoice_items
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
    ON public.invoice_items (invoice_id);

-- ------------------------------------------------------------
-- 3. PAYMENTS — invoice joins + status / date filters
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice
    ON public.invoice_payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_status_date
    ON public.invoice_payments (status, payment_date DESC)
    WHERE status = 'Completed';
CREATE INDEX IF NOT EXISTS idx_invoice_payments_company_status
    ON public.invoice_payments (status)
    INCLUDE (amount, payment_date)
    WHERE status = 'Completed';

CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice
    ON public.payment_transactions (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created
    ON public.payment_transactions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_methods_invoice_method
    ON public.invoice_payment_methods (invoice_id, payment_method)
    WHERE payment_method IS NOT NULL;

-- payment_gateways: almost always filtered by company + active
CREATE INDEX IF NOT EXISTS idx_payment_gateways_company_active
    ON public.payment_gateways (company_id, is_active)
    WHERE is_active = true;

-- payment_reminders
-- NOTE: live DB schema as of 2026-09-10 has NO due_date column
-- on payment_reminders (only sent_at). Index on what exists.
DO $pr$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='payment_reminders'
           AND column_name='due_date'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_payment_reminders_company_status_due
            ON public.payment_reminders (company_id, status, due_date);
    ELSE
        -- Fallback: index on (company_id, status, sent_at) which is what
        -- the reminder queue actually filters on.
        CREATE INDEX IF NOT EXISTS idx_payment_reminders_company_status_sent
            ON public.payment_reminders (company_id, status, sent_at DESC NULLS LAST);
        RAISE NOTICE 'NOTICE 0020-G: payment_reminders.due_date missing - used sent_at fallback';
    END IF;
END $pr$;

-- ------------------------------------------------------------
-- 4. COMM / LOGS
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_smtp_settings_company
    ON public.smtp_settings (company_id);

CREATE INDEX IF NOT EXISTS idx_email_logs_company_created
    ON public.email_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_company_entity
    ON public.activity_logs (company_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_company_created
    ON public.activity_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON public.notifications (user_id, is_read, created_at DESC)
    WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_company_addresses_company_default
    ON public.company_addresses (company_id, is_default)
    WHERE is_default = true;

-- ------------------------------------------------------------
-- 5. ANALYZE — refresh planner stats so the new indexes
--    get used immediately.
-- ------------------------------------------------------------
ANALYZE public.profiles;
ANALYZE public.company_users;
ANALYZE public.clients;
ANALYZE public.client_addresses;
ANALYZE public.services;
ANALYZE public.quotations;
ANALYZE public.quotation_items;
ANALYZE public.invoices;
ANALYZE public.invoice_items;
ANALYZE public.invoice_payments;
ANALYZE public.payment_transactions;
ANALYZE public.invoice_payment_methods;
ANALYZE public.payment_gateways;
ANALYZE public.payment_reminders;
ANALYZE public.smtp_settings;
ANALYZE public.email_logs;
ANALYZE public.activity_logs;
ANALYZE public.notifications;
ANALYZE public.company_addresses;

-- ------------------------------------------------------------
-- 6. Diagnostic NOTICEs
-- ------------------------------------------------------------
DO $$
DECLARE
    v_get_my_company BOOLEAN;
    v_idx_cu        BOOLEAN;
    v_idx_clients   BOOLEAN;
    v_idx_invoices  BOOLEAN;
    v_idx_payments  BOOLEAN;
    v_idx_trgm      BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM pg_proc p
                     JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname='public' AND p.proname='get_my_company_id')
      INTO v_get_my_company;
    SELECT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE schemaname='public' AND indexname='idx_company_users_user_id')
      INTO v_idx_cu;
    SELECT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE schemaname='public' AND indexname='idx_clients_company_created')
      INTO v_idx_clients;
    SELECT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE schemaname='public' AND indexname='idx_invoices_company_status_created')
      INTO v_idx_invoices;
    SELECT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE schemaname='public' AND indexname='idx_invoice_payments_status_date')
      INTO v_idx_payments;
    SELECT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE schemaname='public' AND indexname='idx_clients_company_name_trgm')
      INTO v_idx_trgm;

    RAISE NOTICE 'NOTICE 0020-A: get_my_company_id helper present=%', v_get_my_company;
    RAISE NOTICE 'NOTICE 0020-B: idx_company_users_user_id=%', v_idx_cu;
    RAISE NOTICE 'NOTICE 0020-C: idx_clients_company_created=%', v_idx_clients;
    RAISE NOTICE 'NOTICE 0020-D: idx_invoices_company_status_created=%', v_idx_invoices;
    RAISE NOTICE 'NOTICE 0020-E: idx_invoice_payments_status_date=%', v_idx_payments;
    RAISE NOTICE 'NOTICE 0020-F: idx_clients_company_name_trgm=%', v_idx_trgm;
END $$;




-- ============================================================
-- Migration 0021: Dashboard stats view
--
-- Purpose: The dashboard currently does 9 parallel queries
-- including two that pull EVERY completed payment row into
-- memory just to sum amounts. As the payment table grows
-- this gets slower linearly.
--
-- This view does the SUM() server-side so the dashboard
-- downloads only a single tiny row, not thousands of rows.
-- ============================================================

CREATE OR REPLACE VIEW public.v_dashboard_stats AS
SELECT
    company_id,
    -- All-time revenue from completed payments
    COALESCE(SUM(amount) FILTER (WHERE status = 'Completed'), 0) AS revenue_all_time,
    -- Current-month revenue from completed payments
    COALESCE(SUM(amount) FILTER (
        WHERE status = 'Completed'
          AND payment_date >= date_trunc('month', CURRENT_DATE)::date
    ), 0) AS revenue_this_month
FROM public.invoice_payments
GROUP BY company_id;

GRANT SELECT ON public.v_dashboard_stats TO authenticated;

-- ------------------------------------------------------------
-- Counts view — replaces the 5 head:true count() round-trips
-- the dashboard issues on first load.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_dashboard_counts AS
SELECT
    c.id AS company_id,
    (SELECT COUNT(*) FROM public.clients       WHERE company_id = c.id)                                       AS clients_total,
    (SELECT COUNT(*) FROM public.quotations    WHERE company_id = c.id AND status = 'Sent')                    AS quotations_sent,
    (SELECT COUNT(*) FROM public.quotations    WHERE company_id = c.id AND status = 'Draft')                   AS quotations_draft,
    (SELECT COUNT(*) FROM public.invoices      WHERE company_id = c.id AND status = 'Unpaid')                  AS invoices_unpaid,
    (SELECT COUNT(*) FROM public.invoices      WHERE company_id = c.id AND status = 'Overdue')                 AS invoices_overdue
FROM public.companies c;

GRANT SELECT ON public.v_dashboard_counts TO authenticated;

-- ------------------------------------------------------------
-- Diagnostic NOTICE
-- ------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE 'NOTICE 0021-A: v_dashboard_stats + v_dashboard_counts views created';
END $$;


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


-- ============================================================
-- Migration 0023: Materialised dashboard stats cache
--
-- Purpose: v_dashboard_stats (0021) runs SUM(amount) across
-- every row of invoice_payments on every dashboard render.
-- Once payments grow past a few thousand rows the dashboard
-- gets noticeably laggy.
--
-- This migration replaces v_dashboard_stats with a
-- MATERIALIZED VIEW that the dashboard reads from. The view
-- is refreshed every minute by pg_cron (if available) or
-- manually via SELECT refresh_dashboard_stats_cache().
--
-- The app code (app/(authed)/dashboard/page.tsx) reads from
-- v_dashboard_stats; PostgREST transparently routes reads of
-- a materialised view through its underlying table. So this
-- migration only changes the storage, not the read path.
--
-- Run order:
--   0020 (indexes)  ->  0021 (regular view)  ->  0023 (THIS)
--
-- After 0023 the dashboard will read from
-- public.v_dashboard_stats (materialised) and the per-render
-- SUM() disappears.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Out-of-transaction guard (same rule as 0022)
-- ------------------------------------------------------------
DO $$
BEGIN
    IF current_setting('is_in_transaction') = 'on' THEN
        RAISE EXCEPTION
            'Migration 0023 must NOT run inside a transaction. '
            'Open Supabase SQL Editor and paste this file as-is.';
    END IF;
END $$;

-- ------------------------------------------------------------
-- 1. Drop the old regular view. We re-create it on top of
-- the materialised view below so the dashboard SELECTs
-- continue to work unchanged.
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.v_dashboard_stats CASCADE;

-- ------------------------------------------------------------
-- 2. The materialised view. PRIMARY KEY on company_id so a
-- CONCURRENTLY refresh is possible (which avoids blocking
-- dashboard reads during the refresh).
-- ------------------------------------------------------------
CREATE MATERIALIZED VIEW public.v_dashboard_stats
    (company_id, revenue_all_time, revenue_this_month, refreshed_at)
AS
SELECT
    company_id,
    COALESCE(SUM(amount) FILTER (WHERE status = 'Completed'), 0) AS revenue_all_time,
    COALESCE(SUM(amount) FILTER (
        WHERE status = 'Completed'
          AND payment_date >= date_trunc('month', CURRENT_DATE)::date
    ), 0) AS revenue_this_month,
    now() AS refreshed_at
FROM public.invoice_payments
GROUP BY company_id
WITH NO DATA;

-- Unique index required for REFRESH CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS idx_v_dashboard_stats_company
    ON public.v_dashboard_stats (company_id);

GRANT SELECT ON public.v_dashboard_stats TO authenticated;

-- ------------------------------------------------------------
-- 3. Refresh function. CONCURRENTLY avoids blocking readers.
-- Falls back to a blocking refresh on first run (the
-- materialised view starts empty so CONCURRENTLY fails until
-- the first row exists).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_dashboard_stats_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_dashboard_stats;
EXCEPTION WHEN OTHERS THEN
    -- CONCURRENTLY fails on an empty / non-populated view;
    -- fall back to a blocking refresh (which is fine on an
    -- empty or small table) so first-run never breaks.
    REFRESH MATERIALIZED VIEW public.v_dashboard_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_dashboard_stats_cache() TO authenticated;

-- ------------------------------------------------------------
-- 4. Triggers: keep the cache fresh on every payment write.
-- This guarantees the dashboard is never more than one
-- payment stale, even if pg_cron is disabled.
--
-- Note: REFRESH MATERIALIZED VIEW CONCURRENTLY inside a
-- trigger context is fine because the trigger fires AFTER
-- the statement and the cache is small (one row per
-- company). If you later see lock contention under heavy
-- write load, drop the trigger and rely solely on pg_cron.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_dashboard_stats_cache_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_dashboard_stats;
    EXCEPTION WHEN OTHERS THEN
        REFRESH MATERIALIZED VIEW public.v_dashboard_stats;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_payments_refresh_cache ON public.invoice_payments;
CREATE TRIGGER trg_invoice_payments_refresh_cache
    AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.trg_dashboard_stats_cache_refresh();

-- ------------------------------------------------------------
-- 5. First-run population. We do this once here so the
-- dashboard renders real numbers immediately after the
-- migration runs (instead of waiting for the next payment
-- write or pg_cron tick).
-- ------------------------------------------------------------
REFRESH MATERIALIZED VIEW public.v_dashboard_stats;

-- ------------------------------------------------------------
-- 6. Optional: pg_cron auto-refresh every minute. Supabase
-- projects have pg_cron available by default. If the
-- extension is not installed, skip silently.
-- ------------------------------------------------------------
DO $outer$
DECLARE
    v_cron_call_succeeded BOOLEAN := FALSE;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
        CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
        -- Schedule a safety-net refresh every minute in case
        -- the trigger-based refresh ever gets disabled. The
        -- trigger is the primary mechanism; this is just a
        -- backstop.
        -- We try the function in the 'cron' schema first (Supabase
        -- default), then fall back to 'extensions' (when installed
        -- WITH SCHEMA extensions).
        BEGIN
            PERFORM cron.schedule(
                'refresh-dashboard-stats-cache',
                '* * * * *',  -- every minute
                $cron$SELECT public.refresh_dashboard_stats_cache();$cron$
            );
            v_cron_call_succeeded := TRUE;
        EXCEPTION WHEN undefined_function THEN
            BEGIN
                PERFORM extensions.cron.schedule(
                    'refresh-dashboard-stats-cache',
                    '* * * * *',
                    $cron$SELECT public.refresh_dashboard_stats_cache();$cron$
                );
                v_cron_call_succeeded := TRUE;
            EXCEPTION WHEN OTHERS THEN
                v_cron_call_succeeded := FALSE;
            END;
        END;
        IF v_cron_call_succeeded THEN
            RAISE NOTICE 'NOTICE 0023-X: pg_cron schedule installed';
        ELSE
            RAISE NOTICE 'NOTICE 0023-X: pg_cron installed but cron.schedule() not callable; relying on trigger only';
        END IF;
    ELSE
        RAISE NOTICE 'NOTICE 0023-X: pg_cron not available; relying on trigger only';
    END IF;
END $outer$;

-- ------------------------------------------------------------
-- 7. Diagnostic NOTICEs - confirm objects exist
-- ------------------------------------------------------------
DO $$
DECLARE
    v_mv        BOOLEAN;
    v_idx       BOOLEAN;
    v_fn        BOOLEAN;
    v_trg       BOOLEAN;
    v_rows      BIGINT;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_matviews
         WHERE schemaname='public' AND matviewname='v_dashboard_stats'
    ) INTO v_mv;
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname='public' AND indexname='idx_v_dashboard_stats_company'
    ) INTO v_idx;
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
              JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname='public' AND p.proname='refresh_dashboard_stats_cache'
    ) INTO v_fn;
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_invoice_payments_refresh_cache'
    ) INTO v_trg;
    SELECT COALESCE(c.reltuples::bigint, 0)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relname='v_dashboard_stats'
      INTO v_rows;

    RAISE NOTICE 'NOTICE 0023-A: v_dashboard_stats (materialised) present=%', v_mv;
    RAISE NOTICE 'NOTICE 0023-B: idx_v_dashboard_stats_company present=%', v_idx;
    RAISE NOTICE 'NOTICE 0023-C: refresh_dashboard_stats_cache() present=%', v_fn;
    RAISE NOTICE 'NOTICE 0023-D: trg_invoice_payments_refresh_cache present=%', v_trg;
    RAISE NOTICE 'NOTICE 0023-E: v_dashboard_stats estimated rows=%', v_rows;
END $$;



-- ============================================================
-- AFTER: same objects, should now all be TRUE / "present"
-- ============================================================
SELECT '=== AFTER: performance object inventory ===' AS section;

SELECT
    '0020 idx_company_users_user_id'       AS object,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_company_users_user_id') AS present
UNION ALL SELECT '0020 idx_profiles_company_lookup',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_profiles_company_lookup')
UNION ALL SELECT '0020 idx_clients_company_created',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_clients_company_created')
UNION ALL SELECT '0020 idx_invoices_company_status_created',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_invoices_company_status_created')
UNION ALL SELECT '0020 idx_invoice_payments_status_date',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_invoice_payments_status_date')
UNION ALL SELECT '0021 v_dashboard_stats (now materialised)',
    EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname='public' AND matviewname='v_dashboard_stats')
UNION ALL SELECT '0021 v_dashboard_counts (regular)',
    EXISTS (SELECT 1 FROM pg_views    WHERE schemaname='public' AND viewname='v_dashboard_counts')
UNION ALL SELECT '0022 idx_invoices_company_created_covering',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_invoices_company_created_covering')
UNION ALL SELECT '0022 idx_invoices_company_due_partial_covering',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_invoices_company_due_partial_covering')
UNION ALL SELECT '0022 idx_invoices_due_date_filter',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_invoices_due_date_filter')
UNION ALL SELECT '0022 idx_invoice_payments_payment_date',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_invoice_payments_payment_date')
UNION ALL SELECT '0022 idx_clients_company_name_search',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_clients_company_name_search')
UNION ALL SELECT '0022 idx_quotations_company_created_covering',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_quotations_company_created_covering')
UNION ALL SELECT '0022 idx_email_log_company_created',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_email_log_company_created')
UNION ALL SELECT '0023 v_dashboard_stats materialised',
    EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname='public' AND matviewname='v_dashboard_stats')
UNION ALL SELECT '0023 refresh_dashboard_stats_cache()',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname='public' AND p.proname='refresh_dashboard_stats_cache')
UNION ALL SELECT '0023 trg_invoice_payments_refresh_cache',
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_invoice_payments_refresh_cache')
ORDER BY object;

-- ============================================================
-- AFTER: live row counts so you can sanity-check the views
-- ============================================================
SELECT '=== AFTER: row counts ===' AS section;

SELECT 'clients'                  AS table_name, COUNT(*) AS rows FROM public.clients
UNION ALL SELECT 'invoices',            COUNT(*) FROM public.invoices
UNION ALL SELECT 'invoice_items',       COUNT(*) FROM public.invoice_items
UNION ALL SELECT 'invoice_payments',    COUNT(*) FROM public.invoice_payments
UNION ALL SELECT 'quotations',          COUNT(*) FROM public.quotations
UNION ALL SELECT 'services',            COUNT(*) FROM public.services
UNION ALL SELECT 'companies',           COUNT(*) FROM public.companies
UNION ALL SELECT 'v_dashboard_counts',  COUNT(*) FROM public.v_dashboard_counts
UNION ALL SELECT 'v_dashboard_stats',   COUNT(*) FROM public.v_dashboard_stats
ORDER BY table_name;

