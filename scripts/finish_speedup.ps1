# ============================================================
# finish_speedup.ps1
#
# Runs Runs 2 and 3 of the speedup plan against the live
# Supabase DB via the service-role key + the public.exec_sql
# RPC that was created by 00_create_exec_sql_rpc.sql.
#
# Pre-req: 00_create_exec_sql_rpc.sql has been applied.
# Usage:   powershell -ExecutionPolicy Bypass -File scripts\finish_speedup.ps1
# ============================================================

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".\.env.local")) {
    throw ".env.local not found in current directory."
}
$envFile = Get-Content ".\.env.local" -Raw
$url     = ($envFile | Select-String 'NEXT_PUBLIC_SUPABASE_URL\s*=\s*"?([^"\r\n]+)').Matches[0].Groups[1].Value
$svc     = ($envFile | Select-String 'SUPABASE_SERVICE_ROLE_KEY\s*=\s*"?([^"\r\n]+)').Matches[0].Groups[1].Value

if (-not $url -or -not $svc) {
    throw "Could not parse NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY from .env.local"
}

$rpcUrl = "$url/rest/v1/rpc/exec_sql"
$headers = @{
    "apikey"        = $svc
    "Authorization" = "Bearer $svc"
    "Content-Type"  = "application/json"
}

function Invoke-ExecSql([string]$sql, [string]$label) {
    Write-Host ""
    Write-Host "==> $label" -ForegroundColor Cyan
    $body = @{ sql_text = $sql } | ConvertTo-Json -Compress
    try {
        $r = Invoke-RestMethod -Uri $rpcUrl -Headers $headers -Method POST -Body $body -TimeoutSec 180
        if ($r.ok -eq $true) {
            Write-Host "    [OK]" -ForegroundColor Green
            if ($r.notices -and $r.notices.Count -gt 0) {
                foreach ($n in $r.notices) { Write-Host "    NOTICE: $n" -ForegroundColor Yellow }
            }
        } else {
            Write-Host ("    [FAIL] {0} ({1})" -f $r.error, $r.detail) -ForegroundColor Red
            throw "Migration failed at: $label"
        }
    } catch {
        Write-Host ("    [ERROR] {0}" -f $_.Exception.Message) -ForegroundColor Red
        throw
    }
}

# ============================================================
# RUN 2 - 7 CONCURRENTLY covering indexes (one statement each)
# ============================================================

$run2 = @(
    @{ label = "idx_invoices_company_created_covering";
      sql   = "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_company_created_covering ON public.invoices (company_id, created_at DESC) INCLUDE (invoice_number, total_amount, amount_paid, currency_code, due_date, status, company_address_id, client_id);" },
    @{ label = "idx_invoices_company_due_partial_covering";
      sql   = "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_company_due_partial_covering ON public.invoices (company_id, due_date ASC) INCLUDE (id, invoice_number, total_amount, amount_paid, currency_code, status, client_id) WHERE status IN ('Unpaid', 'Overdue', 'Partial', 'Sent');" },
    @{ label = "idx_invoices_due_date_filter";
      sql   = "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_due_date_filter ON public.invoices (due_date) INCLUDE (id, company_id, status, invoice_number, client_id) WHERE status IN ('Unpaid', 'Partial');" },
    @{ label = "idx_invoice_payments_payment_date (no currency_code - live DB lacks it)";
      sql   = "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoice_payments_payment_date ON public.invoice_payments (payment_date DESC) INCLUDE (invoice_id, amount, status, payment_method);" },
    @{ label = "idx_clients_company_name_search";
      sql   = "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_company_name_search ON public.clients USING gin (full_name gin_trgm_ops, company_name gin_trgm_ops) WHERE company_id IS NOT NULL;" },
    @{ label = "idx_quotations_company_created_covering";
      sql   = "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotations_company_created_covering ON public.quotations (company_id, created_at DESC) INCLUDE (quotation_number, total_amount, currency_code, status, expiry_date, client_id);" },
    @{ label = "idx_email_log_company_created";
      sql   = "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_log_company_created ON public.email_log (company_id, created_at DESC) INCLUDE (to_email, subject, template, status, related_type, related_id);" }
)

foreach ($s in $run2) {
    Invoke-ExecSql $s.sql $s.label
}

# ============================================================
# RUN 3 - views + materialised cache + ANALYZE (one batch)
# ============================================================

$run3 = @"
DROP VIEW IF EXISTS public.v_dashboard_stats CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.v_dashboard_stats CASCADE;

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
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_dashboard_stats;
EXCEPTION WHEN OTHERS THEN
    REFRESH MATERIALIZED VIEW public.v_dashboard_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_dashboard_stats_cache() TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_dashboard_stats_cache_refresh()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
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
"@

Invoke-ExecSql $run3 "RUN 3 (dashboard views + materialised cache + ANALYZE)"

# ============================================================
# FINAL DIAGNOSTIC
# ============================================================

$diag = @"
SELECT
    (SELECT COUNT(*) FROM pg_indexes  WHERE schemaname='public' AND indexname LIKE 'idx_%') AS total_indexes,
    (SELECT COUNT(*) FROM pg_indexes  WHERE schemaname='public' AND indexname LIKE '%_covering') AS covering_indexes,
    (SELECT COUNT(*) FROM pg_matviews WHERE schemaname='public' AND matviewname='v_dashboard_stats') AS dashboard_stats_mv,
    (SELECT COUNT(*) FROM pg_views    WHERE schemaname='public' AND viewname='v_dashboard_counts') AS dashboard_counts_view,
    (SELECT COUNT(*) FROM pg_indexes  WHERE schemaname='public' AND indexname='idx_v_dashboard_stats_company') AS dashboard_unique_idx;
"@

Write-Host ""
Write-Host "==> Final diagnostic" -ForegroundColor Cyan
$body = @{ sql_text = $diag } | ConvertTo-Json -Compress
$r = Invoke-RestMethod -Uri $rpcUrl -Headers $headers -Method POST -Body $body -TimeoutSec 30
Write-Host ($r | ConvertTo-Json -Depth 5)

Write-Host ""
Write-Host "All done." -ForegroundColor Green
Write-Host "Run the verifier next:" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\verify_performance_indexes.ps1" -ForegroundColor Yellow
