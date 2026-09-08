-- STEP 16: Add missing columns to profiles table

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = ''profiles'' ORDER BY ordinal_position;
