-- =============================================================================
-- COMPLETE SEED - Creates company + user profile + all test data
-- Run this ONCE in Supabase SQL Editor to populate everything
-- =============================================================================

DO $$
DECLARE
  v_company_id UUID;
  v_user_id UUID;
  v_client1_id UUID;
  v_client2_id UUID;
  v_client3_id UUID;
  v_client4_id UUID;
  v_client5_id UUID;
  v_invoice_id UUID;
  v_existing_count INTEGER;
BEGIN
  -- ==========================================
  -- STEP 1: Create a test company if none exists
  -- ==========================================
  SELECT id INTO v_company_id FROM public.companies LIMIT 1;
  
  IF v_company_id IS NULL THEN
    INSERT INTO public.companies (name, email, phone, tax_number, website)
    VALUES ('Test Company Inc', 'contact@testcompany.com', '+1 555 0000', 'TAX-9999', 'https://testcompany.com')
    RETURNING id INTO v_company_id;
    RAISE NOTICE 'Created new company: %', v_company_id;
  ELSE
    RAISE NOTICE 'Using existing company: %', v_company_id;
  END IF;

  -- ==========================================
  -- STEP 2: Create a test admin user profile if none exists
  -- ==========================================
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, company_id, full_name, role)
    VALUES (v_user_id, v_company_id, 'Test Admin', 'admin')
    ON CONFLICT (id) DO UPDATE SET company_id = v_company_id;
    RAISE NOTICE 'Profile created/updated for user: %', v_user_id;
  ELSE
    RAISE NOTICE 'No auth users found - please register/login first';
  END IF;

  -- ==========================================
  -- STEP 3: Seed currencies
  -- ==========================================
  SELECT COUNT(*) INTO v_existing_count FROM public.currencies;
  IF v_existing_count = 0 THEN
    INSERT INTO public.currencies (code, symbol, name) VALUES
      ('USD', '$', 'US Dollar'),
      ('EUR', '€', 'Euro'),
      ('GBP', '£', 'British Pound'),
      ('PKR', 'Rs', 'Pakistani Rupee'),
      ('AED', 'د.إ', 'UAE Dirham'),
      ('SAR', 'ر.س', 'Saudi Riyal'),
      ('CAD', 'C$', 'Canadian Dollar'),
      ('AUD', 'A$', 'Australian Dollar');
    RAISE NOTICE 'Currencies seeded (8 rows)';
  END IF;

  -- ==========================================
  -- STEP 4: Seed services
  -- ==========================================
  SELECT COUNT(*) INTO v_existing_count FROM public.services WHERE company_id = v_company_id;
  IF v_existing_count = 0 THEN
    INSERT INTO public.services (company_id, name, description, base_price, unit_type, is_active) VALUES
      (v_company_id, 'Web Development', 'Full-stack web application development using modern frameworks', 150.00, 'hour', true),
      (v_company_id, 'Logo Design', 'Professional logo design with 3 concepts and unlimited revisions', 500.00, 'project', true),
      (v_company_id, 'SEO Optimization', 'Monthly SEO service with keyword research and reporting', 800.00, 'month', true),
      (v_company_id, 'Content Writing', 'Blog posts, articles, and website copy', 100.00, 'hour', true),
      (v_company_id, 'Mobile App Development', 'iOS and Android native app development', 200.00, 'hour', true),
      (v_company_id, 'Business Consulting', 'Strategy and operations consulting', 300.00, 'hour', true);
    RAISE NOTICE 'Services seeded (6 rows)';
  END IF;

  -- ==========================================
  -- STEP 5: Seed clients
  -- ==========================================
  SELECT COUNT(*) INTO v_existing_count FROM public.clients WHERE company_id = v_company_id;
  IF v_existing_count = 0 THEN
    INSERT INTO public.clients (company_id, full_name, company_name, email, phone, website, country, notes) VALUES
      (v_company_id, 'Acme Corporation', 'Acme Corp', 'contact@acme.test', '+1 555 0100', 'https://acme.test', 'United States', 'VIP customer since 2024'),
      (v_company_id, 'Globex Industries', 'Globex', 'info@globex.test', '+44 20 7946 0958', 'https://globex.test', 'United Kingdom', 'Prefers email communication'),
      (v_company_id, 'Initech Software', 'Initech', 'admin@initech.test', '+1 555 0200', NULL, 'Canada', 'Enterprise client'),
      (v_company_id, 'Stark Industries', 'Stark', 'jarvis@stark.test', '+1 555 0300', 'https://stark.test', 'United States', 'High-budget projects'),
      (v_company_id, 'Wayne Enterprises', 'Wayne Corp', 'b.wayne@wayne.test', '+1 555 0400', 'https://wayne.test', 'United States', 'Top-tier client');
    RAISE NOTICE 'Clients seeded (5 rows)';
  END IF;

  -- Get client IDs
  SELECT id INTO v_client1_id FROM public.clients WHERE company_id = v_company_id AND full_name = 'Acme Corporation' LIMIT 1;
  SELECT id INTO v_client2_id FROM public.clients WHERE company_id = v_company_id AND full_name = 'Globex Industries' LIMIT 1;
  SELECT id INTO v_client3_id FROM public.clients WHERE company_id = v_company_id AND full_name = 'Initech Software' LIMIT 1;
  SELECT id INTO v_client4_id FROM public.clients WHERE company_id = v_company_id AND full_name = 'Stark Industries' LIMIT 1;
  SELECT id INTO v_client5_id FROM public.clients WHERE company_id = v_company_id AND full_name = 'Wayne Enterprises' LIMIT 1;

  -- ==========================================
  -- STEP 6: Seed quotations
  -- ==========================================
  SELECT COUNT(*) INTO v_existing_count FROM public.quotations WHERE company_id = v_company_id;
  IF v_existing_count = 0 AND v_client1_id IS NOT NULL THEN
    INSERT INTO public.quotations (company_id, client_id, quotation_number, status, issue_date, expiry_date, total_amount, notes) VALUES
      (v_company_id, v_client1_id, 'QT-2026-001', 'Accepted', '2026-08-15', '2026-09-15', 4500.00, 'Website redesign project - accepted on 2026-08-20'),
      (v_company_id, v_client2_id, 'QT-2026-002', 'Sent', '2026-08-20', '2026-09-20', 1600.00, 'Logo and branding package - awaiting response'),
      (v_company_id, v_client3_id, 'QT-2026-003', 'Draft', '2026-09-01', NULL, 800.00, 'SEO services for Q4 - draft not sent yet'),
      (v_company_id, v_client4_id, 'QT-2026-004', 'Rejected', '2026-08-10', '2026-09-10', 6000.00, 'Mobile app development - client thought too expensive');
    RAISE NOTICE 'Quotations seeded (4 rows)';
  END IF;

  -- ==========================================
  -- STEP 7: Seed invoices
  -- ==========================================
  SELECT COUNT(*) INTO v_existing_count FROM public.invoices WHERE company_id = v_company_id;
  IF v_existing_count = 0 AND v_client1_id IS NOT NULL THEN
    INSERT INTO public.invoices (company_id, client_id, invoice_number, status, issue_date, due_date, subtotal, total_amount, amount_paid, notes) VALUES
      (v_company_id, v_client1_id, 'INV-2026-001', 'Paid', '2026-08-20', '2026-09-03', 4500.00, 4500.00, 4500.00, 'Paid in full on 2026-09-02'),
      (v_company_id, v_client2_id, 'INV-2026-002', 'Sent', '2026-08-25', '2026-09-08', 1600.00, 1600.00, 0, 'Awaiting payment - sent 2026-08-25'),
      (v_company_id, v_client4_id, 'INV-2026-003', 'Unpaid', '2026-09-01', '2026-09-15', 3200.00, 3200.00, 0, 'Consulting hours for August'),
      (v_company_id, v_client5_id, 'INV-2026-004', 'Overdue', '2026-07-15', '2026-07-29', 1200.00, 1200.00, 0, 'Past due - follow up needed');
    RAISE NOTICE 'Invoices seeded (4 rows)';
  END IF;

  -- ==========================================
  -- STEP 8: Seed payment
  -- ==========================================
  SELECT COUNT(*) INTO v_existing_count FROM public.invoice_payments;
  IF v_existing_count = 0 THEN
    SELECT id INTO v_invoice_id FROM public.invoices WHERE invoice_number = 'INV-2026-001' LIMIT 1;
    IF v_invoice_id IS NOT NULL THEN
      INSERT INTO public.invoice_payments (invoice_id, amount, payment_date, payment_method, reference_number, status, notes) VALUES
        (v_invoice_id, 4500.00, '2026-09-02', 'Bank Transfer', 'TXN-2026-001', 'Completed', 'Wire transfer received in full');
      RAISE NOTICE 'Payment seeded (1 row)';
    END IF;
  END IF;

  RAISE NOTICE '=== ALL DONE - Refresh your browser! ===';
END $$;
