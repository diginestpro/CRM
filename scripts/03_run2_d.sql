CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoice_payments_payment_date
    ON public.invoice_payments (payment_date DESC)
    INCLUDE (invoice_id, amount, status, payment_method);
