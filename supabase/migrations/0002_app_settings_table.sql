-- ============================================
-- Migration: 0002_app_settings_table
-- Purpose: Move app_url out of payment_gateways
--          into a dedicated app_settings table.
-- ============================================

-- 1. Create the dedicated app_settings table
CREATE TABLE IF NOT EXISTS public.app_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
    app_url TEXT,
    default_currency_code TEXT,
    default_timezone TEXT DEFAULT 'UTC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Migrate existing app_url from payment_gateways.app_settings row
INSERT INTO public.app_settings (company_id, app_url)
SELECT company_id, config->>'app_url'
FROM public.payment_gateways
WHERE gateway_name = 'app_settings'
  AND company_id IS NOT NULL
ON CONFLICT (company_id) DO UPDATE
  SET app_url = EXCLUDED.app_url,
      updated_at = NOW();

-- 3. Ensure every existing company has an app_settings row
INSERT INTO public.app_settings (company_id)
SELECT id FROM public.companies
WHERE id NOT IN (SELECT company_id FROM public.app_settings)
ON CONFLICT (company_id) DO NOTHING;

-- 4. Remove the hacky app_settings row from payment_gateways
DELETE FROM public.payment_gateways WHERE gateway_name = 'app_settings';

-- 5. Enable RLS and add policies
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their company app settings" ON public.app_settings;
CREATE POLICY "Users can view their company app settings"
  ON public.app_settings FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update their company app settings" ON public.app_settings;
CREATE POLICY "Users can update their company app settings"
  ON public.app_settings FOR ALL
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Service role can read app settings" ON public.app_settings;
CREATE POLICY "Service role can read app settings"
  ON public.app_settings FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS "Service role can write app settings" ON public.app_settings;
CREATE POLICY "Service role can write app settings"
  ON public.app_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);
