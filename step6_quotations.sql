-- STEP 6: Seed quotations
DO $$
DECLARE
  v_company_id UUID;
  v_c1 UUID; v_c2 UUID; v_c3 UUID; v_c4 UUID;
BEGIN
  SELECT id INTO v_company_id FROM public.companies LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE NOTICE 'No company found';
    RETURN;
  END IF;
  
  SELECT id INTO v_c1 FROM public.clients WHERE company_id = v_company_id AND full_name = 'Acme Corporation' LIMIT 1;
  SELECT id INTO v_c2 FROM public.clients WHERE company_id = v_company_id AND full_name = 'Globex Industries' LIMIT 1;
  SELECT id INTO v_c3 FROM public.clients WHERE company_id = v_company_id AND full_name = 'Initech Software' LIMIT 1;
  SELECT id INTO v_c4 FROM public.clients WHERE company_id = v_company_id AND full_name = 'Stark Industries' LIMIT 1;
  
  INSERT INTO public.quotations (company_id, client_id, quotation_number, status, issue_date, expiry_date, total_amount, notes) VALUES
    (v_company_id, v_c1, 'QT-2026-001', 'Accepted', '2026-08-15', '2026-09-15', 4500.00, 'Website redesign - accepted'),
    (v_company_id, v_c2, 'QT-2026-002', 'Sent', '2026-08-20', '2026-09-20', 1600.00, 'Branding package'),
    (v_company_id, v_c3, 'QT-2026-003', 'Draft', '2026-09-01', NULL, 800.00, 'SEO draft'),
    (v_company_id, v_c4, 'QT-2026-004', 'Rejected', '2026-08-10', '2026-09-10', 6000.00, 'Too expensive');
  
  RAISE NOTICE '4 quotations inserted';
END $$;
