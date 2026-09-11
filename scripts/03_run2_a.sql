CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_company_created_covering
    ON public.invoices (company_id, created_at DESC)
    INCLUDE (invoice_number, total_amount, amount_paid, currency_code,
             due_date, status, company_address_id, client_id);
