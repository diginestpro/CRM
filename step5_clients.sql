-- STEP 5: Seed clients
DO $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT id INTO v_company_id FROM public.companies LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE NOTICE 'No company found - run step1 first';
    RETURN;
  END IF;
  
  INSERT INTO public.clients (company_id, full_name, company_name, email, phone, website, country, notes) VALUES
    (v_company_id, 'Acme Corporation', 'Acme Corp', 'contact@acme.test', '+1 555 0100', 'https://acme.test', 'United States', 'VIP customer'),
    (v_company_id, 'Globex Industries', 'Globex', 'info@globex.test', '+44 20 7946 0958', NULL, 'United Kingdom', 'Prefers email'),
    (v_company_id, 'Initech Software', 'Initech', 'admin@initech.test', '+1 555 0200', NULL, 'Canada', 'Enterprise client'),
    (v_company_id, 'Stark Industries', 'Stark', 'jarvis@stark.test', '+1 555 0300', NULL, 'United States', 'High-budget'),
    (v_company_id, 'Wayne Enterprises', 'Wayne Corp', 'b.wayne@wayne.test', '+1 555 0400', NULL, 'United States', 'Top-tier client');
  
  RAISE NOTICE '5 clients inserted';
END $$;
