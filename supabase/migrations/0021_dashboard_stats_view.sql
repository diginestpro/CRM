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
