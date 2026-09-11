# ============================================================
# verify_performance_indexes.ps1
#
# Runs AFTER scripts/apply_perf_migrations.sql has been
# applied in the Supabase SQL Editor. This script:
#   1. Confirms the dashboard views are reachable.
#   2. Times the hottest list-page REST round-trip.
#   3. Prints a reminder to also run scripts/explain_top_queries.sql
#      in the SQL Editor (PostgREST does not allow EXPLAIN).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\verify_performance_indexes.ps1
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

Write-Host ""
Write-Host "============================================================"
Write-Host " Performance verification"
Write-Host "============================================================"
Write-Host " Project : $url"
Write-Host ""

# ---- 1. Reachability check -------------------------------------------
Write-Host "==> Object inventory (REST)"

$checks = @(
    @{ label = "v_dashboard_counts";  uri = "$url/rest/v1/v_dashboard_counts?select=company_id,clients_total,quotations_sent,quotations_draft,invoices_unpaid,invoices_overdue&limit=1" }
    @{ label = "v_dashboard_stats";   uri = "$url/rest/v1/v_dashboard_stats?select=company_id,revenue_all_time,revenue_this_month&limit=1" }
    @{ label = "invoices list";       uri = "$url/rest/v1/invoices?select=id,invoice_number,total_amount,amount_paid&limit=1" }
    @{ label = "clients list";        uri = "$url/rest/v1/clients?select=id,full_name&limit=1" }
    @{ label = "invoice_payments";    uri = "$url/rest/v1/invoice_payments?select=id,amount&limit=1" }
    @{ label = "quotations list";     uri = "$url/rest/v1/quotations?select=id,quotation_number&limit=1" }
    @{ label = "email_log list";      uri = "$url/rest/v1/email_log?select=id,to_email&limit=1" }
)

foreach ($c in $checks) {
    try {
        $r = Invoke-RestMethod -Uri $c.uri -Headers @{
            "apikey"        = $svc
            "Authorization" = "Bearer $svc"
        } -Method GET -TimeoutSec 10
        Write-Host ("  [OK]   {0,-30} reachable" -f $c.label)
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        $color = "Red"
        if ($code -eq 404) { $color = "Yellow" }
        Write-Host ("  [{0}] {1,-30} HTTP {2}" -f $(if ($code -eq 404) { "MISS" } else { "FAIL" }), $c.label, $code) -ForegroundColor $color
    }
}

# ---- 2. Round-trip timing of the dashboard invoices query ----------
Write-Host ""
Write-Host "==> Round-trip timings (10 runs each)"

$endpoints = @(
    @{ name = "invoices list (top 6, covering index)";
      uri  = "$url/rest/v1/invoices?select=id,invoice_number,total_amount,amount_paid,currency_code,due_date,status,company_address_id,created_at,client_id&order=created_at.desc&limit=6" }
    @{ name = "invoices needs-attention (Unpaid/Overdue)";
      uri  = "$url/rest/v1/invoices?select=id,invoice_number,total_amount,currency_code,due_date,status,client_id&status=in.(Unpaid,Overdue)&order=due_date.asc&limit=5" }
    @{ name = "clients list (top 50)";
      uri  = "$url/rest/v1/clients?select=id,full_name,company_name,email,phone,country,is_archived&order=created_at.desc&limit=50" }
    @{ name = "invoice_payments list (top 50)";
      uri  = "$url/rest/v1/invoice_payments?select=id,invoice_id,amount,currency_code,status,payment_method,payment_date&order=payment_date.desc&limit=50" }
)

foreach ($e in $endpoints) {
    $samples = @()
    for ($i = 0; $i -lt 10; $i++) {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        try {
            $null = Invoke-RestMethod -Uri $e.uri -Headers @{
                "apikey"        = $svc
                "Authorization" = "Bearer $svc"
            } -Method GET -TimeoutSec 10
        } catch {}
        $sw.Stop()
        $samples += $sw.ElapsedMilliseconds
    }
    $avg = ($samples | Measure-Object -Average).Average
    $min = ($samples | Measure-Object -Minimum).Minimum
    $max = ($samples | Measure-Object -Maximum).Maximum
    Write-Host ("    {0,-45} avg={1,4}ms  min={2,3}ms  max={3,4}ms" -f $e.name, [int]$avg, $min, $max)
}

# ---- 3. Reminder: run EXPLAIN in SQL Editor -------------------------
Write-Host ""
Write-Host "==> EXPLAIN plans"
Write-Host "    PostgREST does not allow EXPLAIN. To inspect the actual query"
Write-Host "    plans used by the dashboard / list pages, paste the following"
Write-Host "    file into the Supabase SQL Editor:"
Write-Host ""
Write-Host "    scripts/explain_top_queries.sql"
Write-Host ""
Write-Host "    Each query is wrapped in EXPLAIN (ANALYZE, BUFFERS) and will"
Write-Host "    print the plan + actual row counts. After applying the"
Write-Host "    performance migrations every query should use an Index Scan"
Write-Host "    or Index Only Scan, never a Seq Scan."
Write-Host ""
Write-Host "Tip: re-run this script after every code change so you can see"
Write-Host "     regressions. If any average climbs above ~150 ms it is"
Write-Host "     worth re-running scripts/explain_top_queries.sql."
Write-Host ""