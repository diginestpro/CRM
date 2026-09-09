-- ============================================================
-- 0011_branding_and_client_project.sql
--
-- Adds fields that make the CRM truly multi-tenant:
--
--   1) public.clients.project_name        TEXT         (optional)
--      Per-client "project" label so the user can pin a project /
--      job code to the client and surface it on the invoice header.
--
--   2) public.app_settings.brand_name     TEXT         (optional)
--      Display name override that takes precedence over
--      public.companies.name everywhere branding is rendered.
--      Default behaviour: companies.name is used.
--
--   3) public.app_settings.company_website TEXT         (optional)
--      Used to replace the hard-coded "https://diginest.pro"
--      references in the email footer, invoice footer, and pay
--      page. If NULL we fall back to https://diginest.pro (the
--      production site) so we don't accidentally break links.
-- ============================================================

-- 1) Client project name
ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS project_name TEXT;

-- 2) Brand name override on app_settings
ALTER TABLE public.app_settings
    ADD COLUMN IF NOT EXISTS brand_name TEXT;

-- 3) Company website URL on app_settings
ALTER TABLE public.app_settings
    ADD COLUMN IF NOT EXISTS company_website TEXT;

-- --- Verification NOTICE -----------------------------------------

DO $$
DECLARE
    v_has_project      BOOLEAN;
    v_has_brand_name   BOOLEAN;
    v_has_company_web  BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='clients'
          AND column_name='project_name'
    ) INTO v_has_project;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='app_settings'
          AND column_name='brand_name'
    ) INTO v_has_brand_name;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='app_settings'
          AND column_name='company_website'
    ) INTO v_has_company_web;

    RAISE NOTICE 'DIAG-0011: clients.project_name=%, app_settings.brand_name=%, app_settings.company_website=%',
        v_has_project, v_has_brand_name, v_has_company_web;
END $$;
