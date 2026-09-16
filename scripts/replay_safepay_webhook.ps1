# ============================================================
# replay_safepay_webhook.ps1
#
# Replays a SafePay v2.0.0 webhook payload to the live server.
# Use this to recover payments that were marked UNDELIVERED by
# the gateway because the previous version of /api/payments/callback
# did not understand the new { "root": { ... } } envelope.
#
# Usage (from project root):
#   powershell -ExecutionPolicy Bypass -File scripts\replay_safepay_webhook.ps1 `
#       -OrderId "62120d6b-6f31-4a3c-894d-3a810c85e650" `
#       -Tracker "track_c0b85118-2e45-4054-bcc1-226b4b5d73e8" `
#       -AmountCents 10000 `
#       -Email "arslanyasin112233@gmail.com"
#
# Or pass -PayloadPath to a JSON file containing the raw webhook body:
#   powershell -ExecutionPolicy Bypass -File scripts\replay_safepay_webhook.ps1 `
#       -PayloadPath ".\safepay-payload.json"
#
# Optional flags:
#   -BaseUrl "https://crm.diginest.pro"   override target host
#   -DryRun                              check DB state without POSTing
# ============================================================

param(
    [string]$OrderId    = "",
    [string]$Tracker    = "",
    [int]$AmountCents   = 0,
    [string]$Email      = "",
    [string]$PayloadPath = "",
    [string]$BaseUrl    = "https://crm.diginest.pro",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# --- 1. Build the payload -------------------------------------------------
if ($PayloadPath) {
    if (-not (Test-Path $PayloadPath)) {
        throw "PayloadPath '$PayloadPath' not found."
    }
    $body = Get-Content $PayloadPath -Raw
} else {
    if (-not $OrderId -or -not $Tracker -or $AmountCents -le 0) {
        throw "When -PayloadPath is omitted you must supply -OrderId, -Tracker and -AmountCents."
    }
    $seconds = [int][double]::Parse((Get-Date -UFormat %s))
    $body = @"
{"root":{"token":"evt_$Tracker","version":"2.0.0","merchant_api_key":"replay","type":"payment.succeeded","endpoint":"$BaseUrl/api/payments/callback","data":{"tracker":"$Tracker","intent":"CYBERSOURCE","state":"TRACKER_ENDED","net":0,"fee":0,"customer_email":"$Email","amount":$AmountCents,"currency":"USD","metadata":{"order_id":"$OrderId"},"charged_at":{"seconds":$seconds,"nanos":0}},"created_at":{"seconds":$seconds,"nanos":0}}}
"@
}

Write-Host ""
Write-Host "==> Replay payload"
Write-Host $body
Write-Host ""

# --- 2. Pre-flight: inspect the DB ----------------------------------------
if (-not (Test-Path ".\.env.local")) {
    throw ".env.local not found. Run this script from the project root."
}
$envFile = Get-Content ".\.env.local" -Raw
$supaUrl = ($envFile | Select-String 'NEXT_PUBLIC_SUPABASE_URL\s*=\s*"?([^"\r\n]+)').Matches[0].Groups[1].Value
$svc     = ($envFile | Select-String 'SUPABASE_SERVICE_ROLE_KEY\s*=\s*"?([^"\r\n]+)').Matches[0].Groups[1].Value
if (-not $supaUrl -or -not $svc) { throw "Could not parse Supabase keys from .env.local" }

$hdr = @{ "apikey"=$svc; "Authorization"="Bearer $svc" }

Write-Host "==> Pre-flight DB check"
if ($OrderId) {
    try {
        $inv = Invoke-RestMethod -Uri "$supaUrl/rest/v1/invoices?select=id,invoice_number,status,total_amount,amount_paid,currency_code&id=eq.$OrderId" -Headers $hdr -Method GET -TimeoutSec 10
        if ($inv -and $inv.Count -gt 0) {
            Write-Host ("  invoice       : {0}" -f ($inv[0] | ConvertTo-Json -Compress))
            Write-Host ("    status      : {0}" -f $inv[0].status)
            Write-Host ("    total       : {0} {1}" -f $inv[0].total_amount, $inv[0].currency_code)
            Write-Host ("    amount_paid : {0}" -f $inv[0].amount_paid)
        } else {
            Write-Host "  [WARN] invoice $OrderId not found in DB."
        }
    } catch {
        Write-Host ("  [WARN] could not read invoice: HTTP {0}" -f $_.Exception.Response.StatusCode.value__)
    }
}
if ($Tracker) {
    try {
        $txn = Invoke-RestMethod -Uri "$supaUrl/rest/v1/payment_transactions?select=id,status,amount,gateway_transaction_id&gateway_transaction_id=eq.$Tracker" -Headers $hdr -Method GET -TimeoutSec 10
        if ($txn -and $txn.Count -gt 0) {
            Write-Host ("  txn exists    : {0}" -f ($txn[0] | ConvertTo-Json -Compress))
            Write-Host "    -> already processed; webhook handler will skip (idempotent)."
        } else {
            Write-Host "  txn not found : webhook will create a new one."
        }
    } catch {
        Write-Host ("  [WARN] could not read payment_transactions: HTTP {0}" -f $_.Exception.Response.StatusCode.value__)
    }
}
Write-Host ""

# --- 3. Dry-run or POST ---------------------------------------------------
$uri = "$BaseUrl/api/payments/callback"

if ($DryRun) {
    Write-Host "==> Dry run, not POSTing."
    Write-Host "    Target URL: $uri"
    exit 0
}

Write-Host "==> POSTing to $uri"
try {
    $r = Invoke-WebRequest -Uri $uri `
        -Method POST `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body $body `
        -UseBasicParsing `
        -TimeoutSec 20
    Write-Host ("  HTTP {0}" -f $r.StatusCode)
    Write-Host ("  {0}" -f $r.Content)
    if ($r.StatusCode -eq 200) {
        Write-Host ""
        Write-Host "==> Success. Re-check the invoice status in your dashboard."
    } else {
        Write-Host ""
        Write-Host "==> Non-200 response. Check the response body above."
        exit 1
    }
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $respBody = $reader.ReadToEnd()
    Write-Host ("  HTTP {0}" -f $code)
    Write-Host ("  {0}" -f $respBody)
    Write-Host ""
    Write-Host "==> Failed. If the message says 'order_id not found' the fix has not been deployed yet."
    exit 1
}