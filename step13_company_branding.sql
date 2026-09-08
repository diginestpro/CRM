-- STEP 13: Add branding fields to companies table + storage bucket for logos

-- Add missing fields
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS zip TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS tagline TEXT,
  ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#2563eb',
  ADD COLUMN IF NOT EXISTS footer_text TEXT,
  ADD COLUMN IF NOT EXISTS invoice_template TEXT DEFAULT 'modern';

-- Create a public storage bucket for company logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read of company assets
DROP POLICY IF EXISTS "Public can read company assets" ON storage.objects;
CREATE POLICY "Public can read company assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-assets');

-- Allow authenticated users to upload to their own folder
DROP POLICY IF EXISTS "Users can upload company assets" ON storage.objects;
CREATE POLICY "Users can upload company assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'company-assets' AND
    auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Users can update company assets" ON storage.objects;
CREATE POLICY "Users can update company assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'company-assets' AND
    auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Users can delete company assets" ON storage.objects;
CREATE POLICY "Users can delete company assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'company-assets' AND
    auth.uid() IS NOT NULL
  );
