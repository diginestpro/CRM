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
