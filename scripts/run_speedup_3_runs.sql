-- ============================================================
-- SPEEDUP: 3 RUNS, ONE FILE
--
-- The Supabase SQL Editor auto-wraps multi-statement scripts
-- in a transaction. CREATE INDEX CONCURRENTLY cannot run inside
-- a transaction (Postgres error 25001). So this file is split
-- into 3 clearly-marked sections. Paste each section separately
-- and click Run.
--
-- HOW TO USE:
--   1. Open Supabase Dashboard -> SQL Editor -> New query.
--   2. Paste ONLY section [RUN 1] -> click Run -> wait for "run 1 done".
--   3. Clear the editor. Paste ONLY section [RUN 2].
--      Either paste one statement at a time and Run 7 times, OR
--      click the gear icon top-right and turn OFF
--      "Wrap queries in a transaction", then paste all 7 at once.
--   4. Clear the editor. Paste ONLY section [RUN 3] -> click Run.
--
-- Safe to re-run at any point (every CREATE uses IF NOT EXISTS
-- or OR REPLACE; every CREATE INDEX CONCURRENTLY does too).
-- ============================================================


-- ############################################################
-- [RUN 1] Regular indexes + RLS helper rewrite.
-- No CONCURRENTLY statements. Safe as one batch.
-- ############################################################

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_company_users_user_id
    ON public.company_users (user_id);

CREATE INDEX IF NOT EXISTS idx_profiles_company_lookup
    ON public.profiles (id) INCLUDE (company_id)
    WHERE company_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    SELECT company_id FROM public.profiles
     WHERE id = auth.uid()
     LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_my_company_id() TO authenticated, anon;

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

CREATE INDEX IF NOT EXISTS idx_client_addresses_client_default
    ON public.client_addresses (client_id, is_default)
    WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_services_company_active
    ON public.services (company_id, is_active)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_services_company_created
    ON public.services (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quotations_company_status_created
    ON public.quotations (company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quotations_company_client
    ON public.quotations (company_id, client_id);

CREATE INDEX IF NOT EXISTS idx_quotations_client
    ON public.quotations (client_id);

CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation
    ON public.quotation_items (quotation_id);

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

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
    ON public.invoice_items (invoice_id);

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

CREATE INDEX IF NOT EXISTS idx_payment_gateways_company_active
    ON public.payment_gateways (company_id, is_active)
    WHERE is_active = true;

-- payment_reminders: defensive (no due_date column on live DB).
DO $pr$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'payment_reminders'
           AND column_name  = 'due_date'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_payment_reminders_company_status_due
            ON public.payment_reminders (company_id, status, due_date);
    ELSE
        CREATE INDEX IF NOT EXISTS idx_payment_reminders_company_status_sent
            ON public.payment_reminders (company_id, status, sent_at DESC NULLS LAST);
        RAISE NOTICE 'payment_reminders: used sent_at fallback (no due_date column)';
    END IF;
END $pr$;

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

-- Confirm run 1 finished.
SELECT 'run 1 done'                            AS status,
       (SELECT COUNT(*) FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname LIKE 'idx_%')         AS total_indexes;


-- ############################################################
-- [RUN 2] 7 CONCURRENTLY covering indexes.
-- MUST run each statement OUTSIDE a transaction.
-- If the editor auto-wraps, either:
--   (a) paste ONE statement at a time and click Run 7 times, OR
--   (b) click the gear icon and turn off
--       "Wrap queries in a transaction", then paste all 7.
-- ############################################################

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_company_created_covering
    ON public.invoices (company_id, created_at DESC)
    INCLUDE (invoice_number, total_amount, amount_paid, currency_code,
             due_date, status, company_address_id, client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_company_due_partial_covering
    ON public.invoices (company_id, due_date ASC)
    INCLUDE (id, invoice_number, total_amount, amount_paid, currency_code,
             status, client_id)
    WHERE status IN ('Unpaid', 'Overdue', 'Partial', 'Sent');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_due_date_filter
    ON public.invoices (due_date)
    INCLUDE (id, company_id, status, invoice_number, client_id)
    WHERE status IN ('Unpaid', 'Partial');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoice_payments_payment_date
    ON public.invoice_payments (payment_date DESC)
    INCLUDE (invoice_id, amount, currency_code, status, payment_method);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_company_name_search
    ON public.clients USING gin (full_name gin_trgm_ops, company_name gin_trgm_ops)
    WHERE company_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotations_company_created_covering
    ON public.quotations (company_id, created_at DESC)
    INCLUDE (quotation_number, total_amount, currency_code, status,
             expiry_date, client_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_log_company_created
    ON public.email_log (company_id, created_at DESC)
    INCLUDE (to_email, subject, template, status, related_type, related_id);

-- Confirm run 2 finished.
SELECT 'run 2 done'                            AS status,
       (SELECT COUNT(*) FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname LIKE 'idx_%')         AS total_indexes;


-- ############################################################
-- [RUN 3] Dashboard views + materialised cache + ANALYZE.
-- No CONCURRENTLY statements. Safe as one batch.
-- ############################################################

-- Regular view: 5 small COUNTs rolled into one row.
CREATE OR REPLACE VIEW public.v_dashboard_counts AS
SELECT c.id AS company_id,
    (SELECT COUNT(*) FROM public.clients
      WHERE company_id = c.id)                                AS clients_total,
    (SELECT COUNT(*) FROM public.quotations
      WHERE company_id = c.id AND status = 'Sent')             AS quotations_sent,
    (SELECT COUNT(*) FROM public.quotations
      WHERE company_id = c.id AND status = 'Draft')            AS quotations_draft,
    (SELECT COUNT(*) FROM public.invoices
      WHERE company_id = c.id AND status = 'Unpaid')           AS invoices_unpaid,
    (SELECT COUNT(*) FROM public.invoices
      WHERE company_id = c.id AND status = 'Overdue')          AS invoices_overdue
FROM public.companies c;

GRANT SELECT ON public.v_dashboard_counts TO authenticated;

-- Materialised view: SUM(amount) cached; refreshed by trigger + cron.
DROP VIEW IF EXISTS public.v_dashboard_stats CASCADE;

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_v_dashboard_stats_company
    ON public.v_dashboard_stats (company_id);

GRANT SELECT ON public.v_dashboard_stats TO authenticated;

-- Manual refresh function (CONCURRENTLY falls back to blocking on empty view).
CREATE OR REPLACE FUNCTION public.refresh_dashboard_stats_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_dashboard_stats;
EXCEPTION WHEN OTHERS THEN
    REFRESH MATERIALIZED VIEW public.v_dashboard_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_dashboard_stats_cache() TO authenticated;

-- Trigger function: refresh on every payment write.
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

-- First-run population so the dashboard renders real numbers immediately.
REFRESH MATERIALIZED VIEW public.v_dashboard_stats;

-- Optional pg_cron safety net. Skip silently if not installed.
DO $outer$
DECLARE
    v_ok BOOLEAN := FALSE;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
        CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
        BEGIN
            PERFORM cron.schedule(
                'refresh-dashboard-stats-cache',
                '* * * * *',
                $c$SELECT public.refresh_dashboard_stats_cache();$c$
            );
            v_ok := TRUE;
        EXCEPTION WHEN undefined_function THEN
            BEGIN
                PERFORM extensions.cron.schedule(
                    'refresh-dashboard-stats-cache',
                    '* * * * *',
                    $c$SELECT public.refresh_dashboard_stats_cache();$c$
                );
                v_ok := TRUE;
            EXCEPTION WHEN OTHERS THEN
                v_ok := FALSE;
            END;
        END;
    END IF;
END $outer$;

-- Refresh planner stats so the new indexes get used right away.
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

-- Final confirmation.
SELECT
    (SELECT COUNT(*) FROM pg_indexes
      WHERE schemaname = 'public' AND indexname LIKE 'idx_%')  AS total_indexes,
    (SELECT COUNT(*) FROM pg_matviews
      WHERE schemaname = 'public' AND matviewname = 'v_dashboard_stats') AS dashboard_stats_mv,
    (SELECT COUNT(*) FROM pg_views
      WHERE schemaname = 'public' AND viewname = 'v_dashboard_counts')  AS dashboard_counts_view;
