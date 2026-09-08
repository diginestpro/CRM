-- Run this after the migration to verify everything is in place.
-- Expected: 1 row in app_settings, NO row in payment_gateways with gateway_name='app_settings'

-- 1. Check app_settings has your company
SELECT id, company_id, app_url, default_currency_code, default_timezone, created_at, updated_at
FROM public.app_settings;

-- 2. Confirm no app_settings hack remains
SELECT COUNT(*) AS app_settings_rows_should_be_zero
FROM public.payment_gateways
WHERE gateway_name = 'app_settings';

-- 3. Confirm payment_gateways only has real gateways
SELECT gateway_name, is_active, api_key IS NOT NULL AS has_api_key, secret_key IS NOT NULL AS has_secret_key
FROM public.payment_gateways
ORDER BY gateway_name;
