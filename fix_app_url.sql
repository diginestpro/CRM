-- One-time fix: set the app_url to the real production domain.
-- Run this in your Supabase SQL Editor once.
UPDATE public.payment_gateways
SET
  config = jsonb_set(
    COALESCE(config, '{}'::jsonb),
    '{app_url}',
    '"https://crm.diginest.pro"'::jsonb,
    false
  ),
  updated_at = NOW()
WHERE gateway_name = 'app_settings';

-- Verify
SELECT gateway_name, config, is_active
FROM public.payment_gateways
WHERE gateway_name = 'app_settings';
