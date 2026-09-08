-- STEP 15b: Just add the unique constraint (run this if step 15 failed at step 4b)
-- Make sure the company_settings table already exists before running this.

ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_company_name_unique;

ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_company_name_unique UNIQUE (company_id, "key");

SELECT ''Constraint added successfully!'' as status;
