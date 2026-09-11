-- ============================================================
-- explain_top_queries.sql
--
-- Paste this file into the Supabase SQL Editor. It prints the
-- actual execution plan + row counts for every hot query the
-- application runs. After applying migrations 0020-0023 each
-- plan should show "Index Scan" or "Index Only Scan" - never
-- a "Seq Scan" on the large tables (clients, invoices,
-- invoice_payments, quotations).
--
-- HOW TO READ THE OUTPUT:
--   * The top line is the total time + row count.
--   * Each child line is a node. The "cost=" is the planner's
--     estimate; "actual time=" is what really happened.
--   * If you see "Seq Scan on public.invoices" the index is
--     not being used - either the WHERE / ORDER BY does not
--     match the index, or the table is too small for the
--     planner to bother with the index (which is fine).
--
-- WHY WE WRAP IN A CTE: every query references company_id.
-- The CTE materialises the first company so the EXPLAIN is
-- self-contained and reproducible. Real queries always have
-- an explicit company_id from RLS.
-- ============================================================

WITH _one_company AS (
    SELECT id AS company_id FROM public.companies LIMIT 1
)

SELECT '=== 1. invoices list page (dashboard recent) ===' AS query;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, invoice_number, total_amount, amount_paid,
       currency_code, due_date, status, company_address_id,
       created_at, client_id
  FROM public.invoices
 WHERE company_id = (SELECT company_id FROM _one_company)
 ORDER BY created_at DESC
 LIMIT 6;

SELECT '=== 2. dashboard needs-attention (Unpaid/Overdue) ===' AS query;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, invoice_number, total_amount, currency_code,
       due_date, status, client_id
  FROM public.invoices
 WHERE company_id = (SELECT company_id FROM _one_company)
   AND status IN ('Unpaid', 'Overdue')
 ORDER BY due_date ASC
 LIMIT 5;

SELECT '=== 3. clients list page ===' AS query;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, full_name, company_name, email, phone, country,
       is_archived, created_at
  FROM public.clients
 WHERE company_id = (SELECT company_id FROM _one_company)
 ORDER BY created_at DESC
 LIMIT 50;

SELECT '=== 4. invoice_payments list page ===' AS query;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, invoice_id, amount, currency_code, status,
       payment_method, payment_date
  FROM public.invoice_payments
 WHERE company_id = (SELECT company_id FROM _one_company)
 ORDER BY payment_date DESC
 LIMIT 50;

SELECT '=== 5. quotations list page ===' AS query;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, quotation_number, total_amount, currency_code,
       status, expiry_date, client_id, created_at
  FROM public.quotations
 WHERE company_id = (SELECT company_id FROM _one_company)
 ORDER BY created_at DESC
 LIMIT 50;

SELECT '=== 6. dashboard revenue (materialised view) ===' AS query;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.v_dashboard_stats
 WHERE company_id = (SELECT company_id FROM _one_company);

SELECT '=== 7. dashboard counts (regular view) ===' AS query;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.v_dashboard_counts
 WHERE company_id = (SELECT company_id FROM _one_company);

SELECT '=== 8. overdue sweep (cron /api/invoices/check-overdue) ===' AS query;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, company_id, status, due_date, invoice_number, client_id
  FROM public.invoices
 WHERE status IN ('Unpaid', 'Partial')
   AND due_date < CURRENT_DATE
 ORDER BY due_date ASC
 LIMIT 500;

SELECT '=== 9. RLS helper speed (every row of every SELECT) ===' AS query;
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT company_id
  FROM public.profiles
 WHERE id = (SELECT id FROM public.profiles LIMIT 1)
 LIMIT 1;
