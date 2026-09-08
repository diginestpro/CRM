-- =============================================================================
-- SMART SEED - Uses YOUR existing company and profile
-- Run this in Supabase SQL Editor
-- =============================================================================

DO $$
DECLARE
  v_company_id UUID;
  v_user_id UUID;
  v_existing_services INTEGER;
  v_existing_clients INTEGER;
  v_c1 UUID; v_c2 UUID; v_c3 UUID; v_c4 UUID; v_c5 UUID;
  v_existing_invoices INTEGER;
  v_existing_quotations INTEGER;
BEGIN
  -- Get YOUR company
  SELECT id INTO v_company_id FROM public.companies LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE NOTICE 'ERROR: No company found. Complete onboarding first.';
    RETURN;
  END IF;
  RAISE NOTICE 'Using company: %', v_company_id;

  -- Get YOUR user
  SELECT id INTO v_user_id FROM public.profiles WHERE company_id = v_company_id LIMIT 1;
  RAISE NOTICE 'Using user: %', v_user_id;

  -- =============================================================================
  -- SEED SERVICES (only if you have less than 3)
  -- =============================================================================
  SELECT COUNT(*) INTO v_existing_services FROM public.services WHERE company_id = v_company_id;
  RAISE NOTICE 'Existing services: %', v_existing_services;
  
  IF v_existing_services < 3 THEN
    INSERT INTO public.services (company_id, name, description, base_price, unit_type, is_active) VALUES
      (v_company_id, 'Web Development', 'Full-stack web application development', 150.00, 'hour', true),
      (v_company_id, 'Logo Design', 'Professional logo design with 3 concepts', 500.00, 'project', true),
      (v_company_id, 'SEO Optimization', 'Monthly SEO service with reporting', 800.00, 'month', true),
      (v_company_id, 'Content Writing', 'Blog posts and articles', 100.00, 'hour', true),
      (v_company_id, 'Mobile App Development', 'iOS and Android development', 200.00, 'hour', true),
      (v_company_id, 'Business Consulting', 'Strategy and operations consulting', 300.00, 'hour', true)
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Added 6 services';
  END IF;

  -- =============================================================================
  -- SEED CLIENTS (only if you have less than 3)
  -- =============================================================================
  SELECT COUNT(*) INTO v_existing_clients FROM public.clients WHERE company_id = v_company_id;
  RAISE NOTICE 'Existing clients: %', v_existing_clients;
  
  IF v_existing_clients < 3 THEN
    INSERT INTO public.clients (company_id, full_name, company_name, email, phone, website, country, notes) VALUES
      (v_company_id, 'Acme Corporation', 'Acme Corp', 'contact@acme.test', '+1 555 0100', 'https://acme.test', 'United States', 'VIP customer'),
      (v_company_id, 'Globex Industries', 'Globex', 'info@globex.test', '+44 20 7946 0958', NULL, 'United Kingdom', 'Prefers email'),
      (v_company_id, 'Initech Software', 'Initech', 'admin@initech.test', '+1 555 0200', NULL, 'Canada', 'Enterprise'),
      (v_company_id, 'Stark Industries', 'Stark', 'jarvis@stark.test', '+1 555 0300', NULL, 'United States', 'High-budget'),
      (v_company_id, 'Wayne Enterprises', 'Wayne Corp', 'b.wayne@wayne.test', '+1 555 0400', NULL, 'United States', 'Top-tier')
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Added 5 clients';
  END IF;

  -- Get client IDs
  SELECT id INTO v_c1 FROM public.clients WHERE company_id = v_company_id AND full_name = 'Acme Corporation' LIMIT 1;
  SELECT id INTO v_c2 FROM public.clients WHERE company_id = v_company_id AND full_name = 'Globex Industries' LIMIT 1;
  SELECT id INTO v_c3 FROM public.clients WHERE company_id = v_company_id AND full_name = 'Initech Software' LIMIT 1;
  SELECT id INTO v_c4 FROM public.clients WHERE company_id = v_company_id AND full_name = 'Stark Industries' LIMIT 1;
  SELECT id INTO v_c5 FROM public.clients WHERE company_id = v_company_id AND full_name = 'Wayne Enterprises' LIMIT 1;

  -- =============================================================================
  -- SEED QUOTATIONS (only if you have less than 2)
  -- =============================================================================
  SELECT COUNT(*) INTO v_existing_quotations FROM public.quotations WHERE company_id = v_company_id;
  RAISE NOTICE 'Existing quotations: %', v_existing_quotations;
  
  IF v_existing_quotations < 2 AND v_c1 IS NOT NULL THEN
    INSERT INTO public.quotations (company_id, client_id, quotation_number, status, issue_date, expiry_date, total_amount, notes) VALUES
      (v_company_id, v_c1, 'QT-2026-001', 'Accepted', '2026-08-15', '2026-09-15', 4500.00, 'Website redesign - accepted'),
      (v_company_id, v_c2, 'QT-2026-002', 'Sent', '2026-08-20', '2026-09-20', 1600.00, 'Branding package'),
      (v_company_id, v_c3, 'QT-2026-003', 'Draft', '2026-09-01', NULL, 800.00, 'SEO Q4'),
      (v_company_id, v_c4, 'QT-2026-004', 'Rejected', '2026-08-10', '2026-09-10', 6000.00, 'Too expensive')
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Added 4 quotations';
  END IF;

  -- =============================================================================
  -- SEED INVOICES (only if you have less than 3)
  -- =============================================================================
  SELECT COUNT(*) INTO v_existing_invoices FROM public.invoices WHERE company_id = v_company_id;
  RAISE NOTICE 'Existing invoices: %', v_existing_invoices;
  
  IF v_existing_invoices < 3 AND v_c1 IS NOT NULL THEN
    INSERT INTO public.invoices (company_id, client_id, invoice_number, status, issue_date, due_date, subtotal, total_amount, amount_paid, notes) VALUES
      (v_company_id, v_c1, 'INV-2026-001', 'Paid', '2026-08-20', '2026-09-03', 4500.00, 4500.00, 4500.00, 'Paid in full'),
      (v_company_id, v_c2, 'INV-2026-002', 'Sent', '2026-08-25', '2026-09-08', 1600.00, 1600.00, 0, 'Awaiting payment'),
      (v_company_id, v_c4, 'INV-2026-003', 'Unpaid', '2026-09-01', '2026-09-15', 3200.00, 3200.00, 0, 'Consulting hours'),
      (v_company_id, v_c5, 'INV-2026-004', 'Overdue', '2026-07-15', '2026-07-29', 1200.00, 1200.00, 0, 'Past due')
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Added 4 invoices';
  END IF;

  -- =============================================================================
  -- SEED PAYMENT (only if no payments exist)
  -- =============================================================================
  IF NOT EXISTS (SELECT 1 FROM public.invoice_payments) THEN
    INSERT INTO public.invoice_payments (invoice_id, amount, payment_date, payment_method, reference_number, status, notes)
    SELECT id, 4500.00, '2026-09-02', 'Bank Transfer', 'TXN-2026-001', 'Completed', 'Wire transfer received'
    FROM public.invoices WHERE invoice_number = 'INV-2026-001' LIMIT 1;
    RAISE NOTICE 'Added 1 payment';
  END IF;

  RAISE NOTICE '=== SEED COMPLETE ===';
END $$;

-- =============================================================================
-- FINAL VERIFICATION
-- =============================================================================
SELECT 'companies' AS table_name, COUNT(*)::text AS rows FROM public.companies
UNION ALL SELECT 'profiles', COUNT(*)::text FROM public.profiles
UNION ALL SELECT 'company_users', COUNT(*)::text FROM public.company_users
UNION ALL SELECT 'currencies', COUNT(*)::text FROM public.currencies
UNION ALL SELECT 'services', COUNT(*)::text FROM public.services
UNION ALL SELECT 'clients', COUNT(*)::text FROM public.clients
UNION ALL SELECT 'quotations', COUNT(*)::text FROM public.quotations
UNION ALL SELECT 'invoices', COUNT(*)::text FROM public.invoices
UNION ALL SELECT 'invoice_payments', COUNT(*)::text FROM public.invoice_payments
ORDER BY table_name;
