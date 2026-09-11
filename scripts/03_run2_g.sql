CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_log_company_created
    ON public.email_log (company_id, created_at DESC)
    INCLUDE (to_email, subject, template, status, related_type, related_id);
