# Verify the schema fixes by hitting the REST API for each previously
# broken column / table.
param([switch]$Pass = $false)
$ErrorActionPreference = "Stop"

$envFile = Get-Content ".\.env.local" -Raw
$url = ([regex]::Match($envFile, 'NEXT_PUBLIC_SUPABASE_URL\s*=\s*"?([^"\r\n]+)')).Groups[1].Value
$svc = ([regex]::Match($envFile, 'SUPABASE_SERVICE_ROLE_KEY\s*=\s*"?([^"\r\n]+)')).Groups[1].Value

if (-not $url -or -not $svc) { throw "Could not parse .env.local" }

$hdr = @{ apikey = $svc; Authorization = "Bearer $svc" }

function Test-Query($label, $uri) {
  try {
    $r = Invoke-RestMethod -Uri $uri -Headers $hdr -TimeoutSec 10
    Write-Host "  [OK]   $label"
    return $true
  } catch {
    Write-Host "  [FAIL] $label  -> $($_.Exception.Response.StatusCode.value__)  $($_.Exception.Message)"
    return $false
  }
}

Write-Host ""
Write-Host "=== Post-fix schema verification ==="
Write-Host ""

$ok = $true

# 1. services.unit_price
$ok = (Test-Query "services.unit_price" "$url/rest/v1/services?select=id,name,unit_price&limit=1") -and $ok
# 2. services.base_price should still NOT exist (sanity check)
$r = Test-Query "services.base_price (must NOT exist)" "$url/rest/v1/services?select=base_price&limit=1"
if ($r) { Write-Host "    ^ unexpected: column base_price exists" -ForegroundColor Red; $ok = $false }

# 3. invoice_payments.reference_number (we now write to this column)
$ok = (Test-Query "invoice_payments.reference_number" "$url/rest/v1/invoice_payments?select=id,reference_number&limit=1") -and $ok

# 4. payment_transactions.gateway_transaction_id (we now write here)
$ok = (Test-Query "payment_transactions.gateway_transaction_id" "$url/rest/v1/payment_transactions?select=id,gateway_transaction_id&limit=1") -and $ok

# 5. companies.address / brand_color / invoice_template / tagline / footer_text
foreach ($col in @("address","city","state","zip","country","tagline","brand_color","footer_text","invoice_template")) {
  $ok = (Test-Query "companies.$col" "$url/rest/v1/companies?select=$col&limit=1") -and $ok
}

# 6. profiles.email / phone
foreach ($col in @("email","phone")) {
  $ok = (Test-Query "profiles.$col" "$url/rest/v1/profiles?select=$col&limit=1") -and $ok
}

# 7. invoices allows_partial_payments + min_payment
$ok = (Test-Query "invoices.allows_partial_payments" "$url/rest/v1/invoices?select=id,allows_partial_payments&limit=1") -and $ok
$ok = (Test-Query "invoices.min_payment" "$url/rest/v1/invoices?select=id,min_payment&limit=1") -and $ok

Write-Host ""
if ($ok) {
  Write-Host "✅ All post-fix schema checks passed."
} else {
  Write-Host "❌ Some checks failed. See above."
  exit 1
}
