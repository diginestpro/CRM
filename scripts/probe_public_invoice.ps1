# Probe the same code path the public pay page uses:
#   GET /api/public/invoice/<id>
#
# We hit the public Supabase REST endpoint directly to confirm the
# invoice row exists and to inspect which related queries (items,
# payment_methods, payment_gateways, app_settings, companies) succeed.
#
# Usage: powershell -File scripts\probe_public_invoice.ps1 [-Id <uuid>]
param([string]$Id = "8da67136-aa52-4b52-862c-4f3e40850ef8")

$envFile = Get-Content ".\.env.local" -Raw
$url = ([regex]::Match($envFile, 'NEXT_PUBLIC_SUPABASE_URL\s*=\s*"?([^"\r\n]+)')).Groups[1].Value
$svc = ([regex]::Match($envFile, 'SUPABASE_SERVICE_ROLE_KEY\s*=\s*"?([^"\r\n]+)')).Groups[1].Value
$hdr = @{ apikey = $svc; Authorization = "Bearer $svc" }

function Try-Query($label, $uri) {
  Write-Host ""
  Write-Host "[$label] $uri"
  try {
    $r = Invoke-WebRequest -Uri $uri -Headers $hdr -TimeoutSec 10 -Method GET
    Write-Host "  status: $($r.StatusCode)"
    Write-Host "  body  : $($r.Content)"
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    $body = ""
    try { $body = $_.Exception.Response.GetResponseStream() | ForEach-Object { (New-Object IO.StreamReader $_).ReadToEnd() } } catch {}
    Write-Host "  status: $code"
    Write-Host "  body  : $body"
  }
}

# 1. Invoice itself
Try-Query "invoices" "$url/rest/v1/invoices?id=eq.$Id&select=id,invoice_number,company_id,client_id,status,subtotal,tax_amount,total_amount,amount_paid,currency_code,allows_partial_payments,min_payment,company_address_id,selected_address_id"

# 2. Items (with services join)
Try-Query "invoice_items" "$url/rest/v1/invoice_items?invoice_id=eq.$Id&select=*,services(name)"

# 3. Payment methods
Try-Query "invoice_payment_methods" "$url/rest/v1/invoice_payment_methods?invoice_id=eq.$Id&select=payment_method,company_id"

# 4. Company (if company_id was returned above)
Try-Query "companies" "$url/rest/v1/companies?select=id,name,email,phone,address,city,state,zip,country,tagline,brand_color,footer_text"

# 5. App settings
Try-Query "app_settings" "$url/rest/v1/app_settings?select=company_id,app_url,brand_name,company_website,default_currency_code"

# 6. Payment gateways
Try-Query "payment_gateways" "$url/rest/v1/payment_gateways?select=gateway_name,is_active"
