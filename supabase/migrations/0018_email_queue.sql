-- ============================================================
-- Migration 0018: email queue
--
-- Adds a dedicated email_queue table that tracks every email the app
-- intends to send (status: pending/sending/sent/failed) plus an
-- /admin/emails UI for the user to inspect and re-send anything
-- that didn't go out.
--
-- This is separate from email_log (which is a write-only audit log
-- of what actually happened) so the queue can support retries,
-- scheduling, and a clear "pending vs sent" split.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_queue (
    id              uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    company_id      uuid REFERENCES public.companies(id) ON DELETE CASCADE,
    to_email        text NOT NULL,
    from_email      text,
    subject         text NOT NULL,
    body_html       text NOT NULL,
    body_text       text NOT NULL,
    template        text DEFAULT 'general',
    -- E.g. "invoice" / "receipt" / "overdue" / "team_invite".
    related_type    text,
    -- FK to the source row (invoice.id, etc.) when applicable.
    related_id      uuid,
    -- pending -> sending -> sent
    --        \-> failed   (and back to pending on retry)
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
    attempts        int NOT NULL DEFAULT 0,
    last_error      text,
    -- For scheduled sends (e.g. digest / follow-ups). Null = ASAP.
    scheduled_for   timestamptz,
    sent_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Helpful indexes for the UI's typical queries.
CREATE INDEX IF NOT EXISTS idx_email_queue_company_status_created
    ON public.email_queue (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_queue_related
    ON public.email_queue (related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_pending_due
    ON public.email_queue (scheduled_for)
    WHERE status = 'pending';

-- updated_at trigger so the UI can sort reliably.
CREATE OR REPLACE FUNCTION public.tg_email_queue_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_queue_updated_at ON public.email_queue;
CREATE TRIGGER trg_email_queue_updated_at
    BEFORE UPDATE ON public.email_queue
    FOR EACH ROW EXECUTE FUNCTION public.tg_email_queue_updated_at();

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

-- Authenticated users can only see rows in their own company.
DROP POLICY IF EXISTS "Users can view own company email queue" ON public.email_queue;
CREATE POLICY "Users can view own company email queue"
  ON public.email_queue FOR SELECT
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- INSERT/UPDATE/DELETE go through the service role (server actions).
DROP POLICY IF EXISTS "Service role manages email queue" ON public.email_queue;
CREATE POLICY "Service role manages email queue"
  ON public.email_queue FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- Diagnostic NOTICE
-- ------------------------------------------------------------
DO $$
DECLARE
    v_table      BOOLEAN;
    v_rls        BOOLEAN;
    v_idx_status BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema='public' AND table_name='email_queue'
    ) INTO v_table;
    SELECT rowsecurity FROM pg_tables
     WHERE schemaname='public' AND tablename='email_queue'
      INTO v_rls;
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname='public' AND tablename='email_queue'
           AND indexname='idx_email_queue_company_status_created'
    ) INTO v_idx_status;
    RAISE NOTICE 'DIAG-0018: email_queue table=%, RLS=%, status index=%',
        v_table, v_rls, v_idx_status;
END $$;
