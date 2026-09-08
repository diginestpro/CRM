-- STEP 4: Seed services
DO $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT id INTO v_company_id FROM public.companies LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE NOTICE 'No company found - run step1 first';
    RETURN;
  END IF;
  
  INSERT INTO public.services (company_id, name, description, base_price, unit_type, is_active) VALUES
    (v_company_id, 'Web Development', 'Full-stack web application development', 150.00, 'hour', true),
    (v_company_id, 'Logo Design', 'Professional logo design with 3 concepts', 500.00, 'project', true),
    (v_company_id, 'SEO Optimization', 'Monthly SEO service with reporting', 800.00, 'month', true),
    (v_company_id, 'Content Writing', 'Blog posts and articles', 100.00, 'hour', true),
    (v_company_id, 'Mobile App Development', 'iOS and Android development', 200.00, 'hour', true),
    (v_company_id, 'Business Consulting', 'Strategy consulting', 300.00, 'hour', true);
  
  RAISE NOTICE '6 services inserted';
END $$;
