# ============================================================
# test_supabase_connection.ps1
#
# Quick "is my project reachable?" check. Hits:
#   - REST       (PostgREST health)
#   - Auth       (settings endpoint)
#   - Storage    (list buckets)
#   - DB         (via REST /clients?select=id&limit=1)
#
# Usage (from project root):
#   powershell -ExecutionPolicy Bypass -File scripts\test_supabase_connection.ps1
# ============================================================

$ErrorActionPreference = "Stop"

if (-not (Test-Path ".\.env.local")) {
  throw ".env.local not found in current directory."
}
$envFile = Get-Content ".\.env.local" -Raw
$url    = ($envFile | Select-String 'NEXT_PUBLIC_SUPABASE_URL\s*=\s*"?([^"\r\n]+)').Matches[0].Groups[1].Value
$anon   = ($envFile | Select-String 'NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*"?([^"\r\n]+)').Matches[0].Groups[1].Value
$svc    = ($envFile | Select-String 'SUPABASE_SERVICE_ROLE_KEY\s*=\s*"?([^"\r\n]+)').Matches[0].Groups[1].Value

if (-not $url -or -not $anon -or -not $svc) {
  throw "Could not parse all required keys from .env.local"
}

Write-Host ""
Write-Host "==> Project : $url"
Write-Host ""

function Test-Endpoint($label, $uri, $key, [string]$bearer = $null) {
  $hdr = @{ "apikey" = $key }
  if ($bearer) { $hdr["Authorization"] = "Bearer $bearer" }
  try {
    $r = Invoke-RestMethod -Uri $uri -Headers $hdr -Method GET -TimeoutSec 10 -ErrorAction Stop
    Write-Host ("  [OK]   {0,-25} {1}" -f $label, $uri)
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host ("  [FAIL] {0,-25} {1}  (HTTP {2})" -f $label, $uri, $code)
  }
}

# 1. PostgREST — use a known table path (OpenAPI spec requires DB role grants)
Test-Endpoint "PostgREST"        "$url/rest/v1/clients?select=id&limit=1" $anon $anon
# 2. Auth settings
Test-Endpoint "Auth settings"    "$url/auth/v1/settings"  $anon $anon
# 3. Storage bucket list (needs apikey header)
Test-Endpoint "Storage buckets"  "$url/storage/v1/bucket" $anon $anon
# 4. DB read with service role
try {
  $r = Invoke-RestMethod -Uri "$url/rest/v1/clients?select=id&limit=1" `
     -Headers @{ "apikey"=$svc; "Authorization"="Bearer $svc" } -TimeoutSec 10
  Write-Host "  [OK]   DB read (svc)           $($r.Count) row(s) returned"
} catch {
  Write-Host "  [FAIL] DB read (svc)           $($_.Exception.Response.StatusCode.value__)"
}

Write-Host ""
Write-Host "If any line says [FAIL], fix that before backing up."
