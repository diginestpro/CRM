CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clients_company_name_search
    ON public.clients USING gin (full_name gin_trgm_ops, company_name gin_trgm_ops)
    WHERE company_id IS NOT NULL;
