-- STEP 11: Fix SafePay API URL in database
-- The api_url was incorrectly set to include /embedded at the end
-- The correct value should be just the base URL: https://sandbox.api.getsafepay.com

UPDATE public.payment_gateways
SET
  config = jsonb_set(
    config,
    '{api_url}',
    '"https://sandbox.api.getsafepay.com"'::jsonb,
    false
  ),
  updated_at = NOW()
WHERE gateway_name = 'safepay'
  AND config->>'api_url' LIKE '%/embedded%';

-- Verify the fix
SELECT gateway_name, config->>'api_url' as api_url
FROM public.payment_gateways
WHERE gateway_name = 'safepay';
