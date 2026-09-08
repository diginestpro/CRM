-- STEP 14: Ensure activity_logs table has all needed columns

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_company_created
  ON public.activity_logs(company_id, created_at DESC);

-- Allow users to see their company activity
DROP POLICY IF EXISTS "Users can view activity" ON public.activity_logs;
CREATE POLICY "Users can view activity"
  ON public.activity_logs FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Service can insert activity" ON public.activity_logs;
CREATE POLICY "Service can insert activity"
  ON public.activity_logs FOR INSERT
  WITH CHECK (true);
