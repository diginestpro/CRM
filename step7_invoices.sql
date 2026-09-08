-- STEP 7: Seed invoices
DO $$
DECLARE
  v_company_id UUID;
  v_c1 UUID; v_c2 UUID; v_c4 UUID; v_c5 UUID;
BEGIN
  SELECT id INTO v_company_id FROM public.companies LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE NOTICE 'No company found';
    RETURN;
  END IF;
  
  SELECT id INTO v_c1 FROM public.clients WHERE company_id = v_company_id AND full_name = 'Acme Corporation' LIMIT 1;
  SELECT id INTO v_c2 FROM public.clients WHERE company_id = v_company_id AND full_name = 'Globex Industries' LIMIT 1;
  SELECT id INTO v_c4 FROM public.clients WHERE company_id = v_company_id AND full_name = 'Stark Industries' LIMIT 1;
  SELECT id INTO v_c5 FROM public.clients WHERE company_id = v_company_id AND full_name = 'Wayne Enterprises' LIMIT 1;
  
  INSERT INTO public.invoices (company_id, client_id, invoice_number, status, issue_date, due_date, subtotal, total_amount, amount_paid, notes) VALUES
    (v_company_id, v_c1, 'INV-2026-001', 'Paid', '2026-08-20', '2026-09-03', 4500.00, 4500.00, 4500.00, 'Paid in full'),
    (v_company_id, v_c2, 'INV-2026-002', 'Sent', '2026-08-25', '2026-09-08', 1600.00, 1600.00, 0, 'Awaiting payment'),
    (v_company_id, v_c4, 'INV-2026-003', 'Unpaid', '2026-09-01', '2026-09-15', 3200.00, 3200.00, 0, 'Consulting'),
    (v_company_id, v_c5, 'INV-2026-004', 'Overdue', '2026-07-15', '2026-07-29', 1200.00, 1200.00, 0, 'Past due');
  
  RAISE NOTICE '4 invoices inserted';
END $$;
