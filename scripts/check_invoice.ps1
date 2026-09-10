param([string]$Number = "INV-2026-0017")
$envFile = Get-Content ".\.env.local" -Raw
$url = ([regex]::Match($envFile, 'NEXT_PUBLIC_SUPABASE_URL\s*=\s*"?([^"\r\n]+)')).Groups[1].Value
$svc = ([regex]::Match($envFile, 'SUPABASE_SERVICE_ROLE_KEY\s*=\s*"?([^"\r\n]+)')).Groups[1].Value
$hdr = @{ apikey = $svc; Authorization = "Bearer $svc" }

Write-Host ""
Write-Host "=== $Number ==="
$rows = Invoke-RestMethod -Uri ($url + "/rest/v1/invoices?select=id,invoice_number,subtotal,tax_rate,tax_amount,total_amount,amount_paid,status&invoice_number=eq.$Number") -Headers $hdr -TimeoutSec 10

if (-not $rows -or $rows.Count -eq 0) {
  Write-Host "  not found."
  exit 1
}

$row = $rows[0]
Write-Host ("  subtotal      : {0,10:N2}" -f [double]$row.subtotal)
Write-Host ("  tax_rate (%)  : {0,10:N2}" -f [double]$row.tax_rate)
Write-Host ("  tax_amount    : {0,10:N2}" -f [double]$row.tax_amount)
Write-Host ("  total_amount  : {0,10:N2}" -f [double]$row.total_amount)
Write-Host ("  amount_paid   : {0,10:N2}" -f [double]$row.amount_paid)
Write-Host "  status        : $($row.status)"

$items = Invoke-RestMethod -Uri ($url + "/rest/v1/invoice_items?select=description,quantity,unit_price,total_amount&invoice_id=eq." + $row.id) -Headers $hdr -TimeoutSec 10
Write-Host ""
Write-Host "Items:"
$items | ForEach-Object {
  Write-Host ("  - {0,-30} qty={1} unit={2,8:N2} line={3,8:N2}" -f $_.description, $_.quantity, $_.unit_price, $_.total_amount)
}
