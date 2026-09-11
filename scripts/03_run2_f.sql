CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quotations_company_created_covering
    ON public.quotations (company_id, created_at DESC)
    INCLUDE (quotation_number, total_amount, currency_code, status,
             expiry_date, client_id);
