CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_company_due_partial_covering
    ON public.invoices (company_id, due_date ASC)
    INCLUDE (id, invoice_number, total_amount, amount_paid, currency_code,
             status, client_id)
    WHERE status IN ('Unpaid', 'Overdue', 'Partial', 'Sent');
