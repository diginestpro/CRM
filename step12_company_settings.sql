-- STEP 12: Create company_settings table for SMTP and other per-company config

CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid NOT NULL DEFAULT extensions.uuid_generate_v4(),
  company_id uuid NULL,
  key text NOT NULL,
  value text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  constraint company_settings_pkey PRIMARY KEY (id),
  CONSTRAINT company_settings_company_name_unique UNIQUE (company_id, key)
) TABLESPACE pg_default;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their company settings" ON public.company_settings;
CREATE POLICY "Users can view their company settings"
  ON public.company_settings FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can manage their company settings" ON public.company_settings;
CREATE POLICY "Users can manage their company settings"
  ON public.company_settings FOR ALL
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );
