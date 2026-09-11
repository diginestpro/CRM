CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_due_date_filter
    ON public.invoices (due_date)
    INCLUDE (id, company_id, status, invoice_number, client_id)
    WHERE status IN ('Unpaid', 'Partial');
