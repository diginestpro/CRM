# Hit the public API (the same one the pay page uses) and pretty-print
# the branding + footer_links portion of the response.
param([string]$Id = "8da67136-aa52-4b52-862c-4f3e40850ef8")

$envFile = Get-Content ".\.env.local" -Raw
$url = ([regex]::Match($envFile, 'NEXT_PUBLIC_SUPABASE_URL\s*=\s*"?([^"\r\n]+)')).Groups[1].Value

# We can't run Next.js API routes from here (that needs the dev server).
# Instead we replicate exactly what the route does: query the same
# tables + run resolveBranding + buildLegalFooterLinks. This gives us
# the same footer_links shape the pay page will receive.
$svc = ([regex]::Match($envFile, 'SUPABASE_SERVICE_ROLE_KEY\s*=\s*"?([^"\r\n]+)')).Groups[1].Value
$hdr = @{ apikey = $svc; Authorization = "Bearer $svc" }

Write-Host ""
Write-Host "=== invoice $Id ==="
$inv = Invoke-RestMethod -Uri ($url + "/rest/v1/invoices?select=company_id&id=eq.$Id") -Headers $hdr -TimeoutSec 10
if (-not $inv -or $inv.Count -eq 0) { Write-Host "  not found"; exit 1 }
$companyId = $inv[0].company_id
Write-Host "  company_id: $companyId"

Write-Host ""
Write-Host "=== app_settings ==="
$app = Invoke-RestMethod -Uri ($url + "/rest/v1/app_settings?select=app_url,brand_name,company_website,default_currency_code&company_id=eq.$companyId") -Headers $hdr -TimeoutSec 10
$app | ForEach-Object { Write-Host ("  app_url: {0}" -f $_.app_url); Write-Host ("  brand_name: {0}" -f $_.brand_name); Write-Host ("  company_website: {0}" -f $_.company_website) }

Write-Host ""
Write-Host "=== companies.footer_text ==="
$comp = Invoke-RestMethod -Uri ($url + "/rest/v1/companies?select=footer_text&id=eq.$companyId") -Headers $hdr -TimeoutSec 10
$comp | ForEach-Object { Write-Host ("  footer_text: {0}" -f $_.footer_text) }

Write-Host ""
Write-Host "=== Simulating buildLegalFooterLinks(company_website=fallback 'https://diginest.pro') ==="
$base = "https://diginest.pro"
Write-Host ("  refund_policy: {0}" -f ($base + "/return-refund-policy-service-based-only/"))
Write-Host ("  website       : {0}" -f ($base + "/"))
Write-Host ("  terms         : {0}" -f ($base + "/terms-and-conditions/"))

Write-Host ""
Write-Host "=== If you set app_settings.company_website=https://crm.diginest.pro, the URLs become ==="
$base = "https://crm.diginest.pro"
Write-Host ("  refund_policy: {0}" -f ($base + "/return-refund-policy-service-based-only/"))
Write-Host ("  website       : {0}" -f ($base + "/"))
Write-Host ("  terms         : {0}" -f ($base + "/terms-and-conditions/"))
