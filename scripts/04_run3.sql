-- ============================================================
-- RUN 3: Dashboard views + materialised cache + ANALYZE
-- (No CONCURRENTLY - safe to run as one batch)
-- ============================================================

-- Safely drop whatever exists for v_dashboard_stats (view OR materialised
-- view OR nothing). DROP VIEW errors if the object is a materialised
-- view, so we have to check pg_class first.
DO $d$
DECLARE v_kind text;
BEGIN
    SELECT c.relkind INTO v_kind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'v_dashboard_stats';
    IF v_kind = 'v' THEN
        EXECUTE 'DROP VIEW public.v_dashboard_stats CASCADE';
    ELSIF v_kind = 'm' THEN
        EXECUTE 'DROP MATERIALIZED VIEW public.v_dashboard_stats CASCADE';
    END IF;
    -- 'r' (table) or NULL (not present): do nothing.
END $d$;

CREATE OR REPLACE VIEW public.v_dashboard_counts AS
SELECT c.id AS company_id,
    (SELECT COUNT(*) FROM public.clients    WHERE company_id = c.id)                       AS clients_total,
    (SELECT COUNT(*) FROM public.quotations WHERE company_id = c.id AND status = 'Sent')    AS quotations_sent,
    (SELECT COUNT(*) FROM public.quotations WHERE company_id = c.id AND status = 'Draft')   AS quotations_draft,
    (SELECT COUNT(*) FROM public.invoices   WHERE company_id = c.id AND status = 'Unpaid')  AS invoices_unpaid,
    (SELECT COUNT(*) FROM public.invoices   WHERE company_id = c.id AND status = 'Overdue') AS invoices_overdue
FROM public.companies c;

GRANT SELECT ON public.v_dashboard_counts TO authenticated;

CREATE MATERIALIZED VIEW public.v_dashboard_stats
    (company_id, revenue_all_time, revenue_this_month, refreshed_at)
AS
SELECT
    i.company_id,
    COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'Completed'), 0) AS revenue_all_time,
    COALESCE(SUM(p.amount) FILTER (
        WHERE p.status = 'Completed'
          AND p.payment_date >= date_trunc('month', CURRENT_DATE)::date
    ), 0) AS revenue_this_month,
    now() AS refreshed_at
FROM public.invoice_payments p
JOIN public.invoices i ON i.id = p.invoice_id
GROUP BY i.company_id
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_v_dashboard_stats_company
    ON public.v_dashboard_stats (company_id);

GRANT SELECT ON public.v_dashboard_stats TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_dashboard_stats_cache()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_dashboard_stats;
EXCEPTION WHEN OTHERS THEN
    REFRESH MATERIALIZED VIEW public.v_dashboard_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_dashboard_stats_cache() TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_dashboard_stats_cache_refresh()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
BEGIN
    BEGIN REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_dashboard_stats;
    EXCEPTION WHEN OTHERS THEN REFRESH MATERIALIZED VIEW public.v_dashboard_stats;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_payments_refresh_cache ON public.invoice_payments;
CREATE TRIGGER trg_invoice_payments_refresh_cache
    AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
    FOR EACH STATEMENT EXECUTE FUNCTION public.trg_dashboard_stats_cache_refresh();

REFRESH MATERIALIZED VIEW public.v_dashboard_stats;

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

SELECT
    (SELECT COUNT(*) FROM pg_indexes  WHERE schemaname='public' AND indexname LIKE 'idx_%') AS total_indexes,
    (SELECT COUNT(*) FROM pg_indexes  WHERE schemaname='public' AND indexname LIKE '%_covering') AS covering_indexes,
    (SELECT COUNT(*) FROM pg_matviews WHERE schemaname='public' AND matviewname='v_dashboard_stats') AS dashboard_stats_mv,
    (SELECT COUNT(*) FROM pg_views    WHERE schemaname='public' AND viewname='v_dashboard_counts') AS dashboard_counts_view,
    (SELECT COUNT(*) FROM pg_indexes  WHERE schemaname='public' AND indexname='idx_v_dashboard_stats_company') AS dashboard_unique_idx;
