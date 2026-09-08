-- STEP 10: Clean up corrupted SafePay data
-- This fixes the SafePay row where the URL was incorrectly stored in the secret_key column.
-- Run this ONCE to clean up, then re-enter your secret key via the Settings UI.

UPDATE public.payment_gateways
SET
  -- If secret_key looks like a URL, clear it
  secret_key = CASE
    WHEN secret_key LIKE 'http://%' OR secret_key LIKE 'https://%' THEN ''
    ELSE secret_key
  END,
  -- api_key should never be the URL
  api_key = CASE
    WHEN api_key LIKE 'http://%' OR api_key LIKE 'https://%' THEN ''
    ELSE api_key
  END,
  -- Make sure config has the API URL properly
  config = CASE
    WHEN config IS NULL OR config::text = '' OR config::text = '{}' THEN
      '{"api_url": "https://sandbox.api.getsafepay.com"}'::jsonb
    WHEN config::text NOT LIKE '%api_url%' THEN
      config || '{"api_url": "https://sandbox.api.getsafepay.com"}'::jsonb
    ELSE config
  END,
  updated_at = NOW()
WHERE gateway_name = 'safepay';

-- Verify the cleanup
SELECT id, gateway_name,
  LEFT(api_key, 20) as api_key_preview,
  LEFT(secret_key, 20) as secret_key_preview,
  config
FROM public.payment_gateways
WHERE gateway_name = 'safepay';
