-- ============================================================
-- Full functional verification of every SQL object + index.
-- Paste in Supabase SQL Editor -> Run.
-- ============================================================

-- 1. INDEX INVENTORY - count + sample
SELECT
    'idx_* count'                AS object,
    COUNT(*)::text               AS value
  FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'idx_%'
UNION ALL SELECT
    'total indexes (any name)',
    COUNT(*)::text
  FROM pg_indexes WHERE schemaname='public'
ORDER BY object;

-- 2. The 7 covering indexes from Run 2 (0022)
SELECT indexname
  FROM pg_indexes
 WHERE schemaname='public'
   AND indexname IN (
       'idx_invoices_company_created_covering',
       'idx_invoices_company_due_partial_covering',
       'idx_invoices_due_date_filter',
       'idx_invoice_payments_payment_date',
       'idx_clients_company_name_search',
       'idx_quotations_company_created_covering',
       'idx_email_log_company_created'
   )
ORDER BY indexname;

-- 3. Sample of 0020 indexes
SELECT indexname
  FROM pg_indexes
 WHERE schemaname='public'
   AND indexname IN (
       'idx_company_users_user_id',
       'idx_profiles_company_lookup',
       'idx_clients_company_created',
       'idx_clients_company_archived_created',
       'idx_clients_company_name_trgm',
       'idx_invoices_company_status_created',
       'idx_invoices_company_due_date',
       'idx_invoice_payments_status_date',
       'idx_activity_logs_company_created'
   )
ORDER BY indexname;

-- 4. VIEWS + FUNCTIONS + TRIGGERS
SELECT
    'v_dashboard_counts (view)' AS object,
    CASE WHEN EXISTS (SELECT 1 FROM pg_views
                       WHERE schemaname='public' AND viewname='v_dashboard_counts')
         THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL SELECT
    'v_dashboard_stats (materialised view)',
    CASE WHEN EXISTS (SELECT 1 FROM pg_matviews
                       WHERE schemaname='public' AND matviewname='v_dashboard_stats')
         THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT
    'idx_v_dashboard_stats_company (unique idx)',
    CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
                       WHERE schemaname='public' AND indexname='idx_v_dashboard_stats_company')
         THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT
    'refresh_dashboard_stats_cache()',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                       WHERE n.nspname='public' AND p.proname='refresh_dashboard_stats_cache')
         THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT
    'trg_dashboard_stats_cache_refresh()',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                       WHERE n.nspname='public' AND p.proname='trg_dashboard_stats_cache_refresh')
         THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT
    'trg_invoice_payments_refresh_cache (trigger)',
    CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_invoice_payments_refresh_cache')
         THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT
    'get_my_company_id() (0020 rewrite)',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                       WHERE n.nspname='public' AND p.proname='get_my_company_id')
         THEN 'OK' ELSE 'MISSING' END;

-- 5. POPULATED DATA CHECK
SELECT 'v_dashboard_counts rows' AS what, COUNT(*)::text AS n FROM public.v_dashboard_counts
UNION ALL SELECT 'v_dashboard_stats rows', COUNT(*)::text FROM public.v_dashboard_stats
UNION ALL SELECT 'companies rows', COUNT(*)::text FROM public.companies
UNION ALL SELECT 'invoices rows', COUNT(*)::text FROM public.invoices
UNION ALL SELECT 'invoice_payments rows', COUNT(*)::text FROM public.invoice_payments
UNION ALL SELECT 'clients rows', COUNT(*)::text FROM public.clients;

-- 6. ACTUAL DASHBOARD DATA the UI renders
-- (LIMIT inside a UNION arm must be wrapped in parens)
SELECT * FROM (
    SELECT 'dashboard revenue all-time' AS metric, revenue_all_time::text AS value
      FROM public.v_dashboard_stats
) a
UNION ALL SELECT * FROM (
    SELECT 'dashboard revenue this month', revenue_this_month::text
      FROM public.v_dashboard_stats
) b
UNION ALL SELECT * FROM (
    SELECT 'clients total', clients_total::text
      FROM public.v_dashboard_counts
) c
UNION ALL SELECT * FROM (
    SELECT 'unpaid invoices', invoices_unpaid::text
      FROM public.v_dashboard_counts
) d
UNION ALL SELECT * FROM (
    SELECT 'overdue invoices', invoices_overdue::text
      FROM public.v_dashboard_counts
) e;

-- 7. EXPLAIN ANALYZE - every hot query
-- (Should see Index Scan / Index Only Scan, never Seq Scan)

-- Dashboard recent invoices
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, invoice_number, total_amount, amount_paid,
       currency_code, due_date, status, company_address_id,
       created_at, client_id
  FROM public.invoices
 WHERE company_id = (SELECT id FROM public.companies LIMIT 1)
 ORDER BY created_at DESC LIMIT 6;

-- Dashboard needs-attention (Unpaid/Overdue)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, invoice_number, total_amount, currency_code,
       due_date, status, client_id
  FROM public.invoices
 WHERE company_id = (SELECT id FROM public.companies LIMIT 1)
   AND status IN ('Unpaid', 'Overdue')
 ORDER BY due_date ASC LIMIT 5;

-- Dashboard revenue (materialised view - should be Index Only Scan)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.v_dashboard_stats
 WHERE company_id = (SELECT id FROM public.companies LIMIT 1);

-- Dashboard counts (regular view - multiple sub-queries)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.v_dashboard_counts
 WHERE company_id = (SELECT id FROM public.companies LIMIT 1);

-- Clients list
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, full_name, company_name, email, phone, country,
       is_archived, created_at
  FROM public.clients
 WHERE company_id = (SELECT id FROM public.companies LIMIT 1)
 ORDER BY created_at DESC LIMIT 50;

-- Invoice payments list
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, invoice_id, amount, currency_code, status,
       payment_method, payment_date
  FROM public.invoice_payments
 ORDER BY payment_date DESC LIMIT 50;

-- RLS helper speed
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT company_id FROM public.profiles WHERE id = (SELECT id FROM public.profiles LIMIT 1) LIMIT 1;
