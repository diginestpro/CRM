-- STEP 8: Seed payment
DO $$
DECLARE
  v_invoice_id UUID;
BEGIN
  SELECT id INTO v_invoice_id FROM public.invoices WHERE invoice_number = 'INV-2026-001' LIMIT 1;
  IF v_invoice_id IS NULL THEN
    RAISE NOTICE 'No invoice found';
    RETURN;
  END IF;
  
  INSERT INTO public.invoice_payments (invoice_id, amount, payment_date, payment_method, reference_number, status, notes)
  VALUES (v_invoice_id, 4500.00, '2026-09-02', 'Bank Transfer', 'TXN-001', 'Completed', 'Wire transfer');
  
  RAISE NOTICE '1 payment inserted';
END $$;
