-- ============================================
-- Migration 0005: Email log table
-- ============================================
CREATE TABLE IF NOT EXISTS public.email_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  from_email TEXT,
  subject TEXT NOT NULL,
  body TEXT,
  template TEXT,
  related_type TEXT,
  related_id UUID,
  status TEXT DEFAULT 'sent',
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_log_company ON public.email_log (company_id);
CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON public.email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_related ON public.email_log (related_type, related_id);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their company email log" ON public.email_log;
CREATE POLICY "Users can view their company email log"
  ON public.email_log FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Service role manages email log" ON public.email_log;
CREATE POLICY "Service role manages email log"
  ON public.email_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);
