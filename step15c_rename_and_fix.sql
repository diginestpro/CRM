-- ============================================
-- STEP 15c: Alternative approach - rename key column to setting_key
-- Run this INSTEAD of step 15 if the key issue persists.
-- ============================================

-- 1. Create company_settings table WITHOUT the key column
CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  company_id uuid NULL,
  setting_key text NOT NULL,
  setting_value text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  constraint company_settings_pkey PRIMARY KEY (id),
  CONSTRAINT company_settings_company_key_unique UNIQUE (company_id, setting_key)
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Company Settings Access" ON public.company_settings;
CREATE POLICY "Company Settings Access" ON public.company_settings FOR ALL
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Service role can manage settings" ON public.company_settings;
CREATE POLICY "Service role can manage settings" ON public.company_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Add helper function
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- 3. Add missing columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 4. Add branding fields to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS zip TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS tagline TEXT,
  ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT chr(35) || '2563eb',
  ADD COLUMN IF NOT EXISTS footer_text TEXT,
  ADD COLUMN IF NOT EXISTS invoice_template TEXT DEFAULT 'modern';

-- 5. Storage bucket for company assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can read company assets" ON storage.objects;
CREATE POLICY "Public can read company assets"
  ON storage.objects FOR SELECT USING (bucket_id = 'company-assets');

DROP POLICY IF EXISTS "Users can upload company assets" ON storage.objects;
CREATE POLICY "Users can upload company assets"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'company-assets' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update company assets" ON storage.objects;
CREATE POLICY "Users can update company assets"
  ON storage.objects FOR UPDATE USING (bucket_id = 'company-assets' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can delete company assets" ON storage.objects;
CREATE POLICY "Users can delete company assets"
  ON storage.objects FOR DELETE USING (bucket_id = 'company-assets' AND auth.uid() IS NOT NULL);

-- 6. activity_logs columns
ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_activity_logs_company_created
  ON public.activity_logs(company_id, created_at DESC);

DROP POLICY IF EXISTS "Users can view activity" ON public.activity_logs;
CREATE POLICY "Users can view activity" ON public.activity_logs FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS "Service can insert activity" ON public.activity_logs;
CREATE POLICY "Service can insert activity" ON public.activity_logs FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Users can insert activity" ON public.activity_logs;
CREATE POLICY "Users can insert activity" ON public.activity_logs FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

-- 7. company_users RLS
DROP POLICY IF EXISTS "Company Users Access" ON public.company_users;
CREATE POLICY "Company Users Access" ON public.company_users FOR ALL
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

SELECT 'All fixes applied successfully!' as status;
