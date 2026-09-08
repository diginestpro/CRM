-- =============================================================================
-- COMPLETE CRM DATABASE SEED - Works even with minimal setup
-- =============================================================================

-- Ensure all required permissions are granted
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- =============================================================================
-- CREATE COMPANY (if none exists)
-- =============================================================================
INSERT INTO public.companies (id, name, email, phone, tax_number, website, created_at, updated_at)
SELECT '11111111-1111-1111-1111-111111111111'::uuid, 'My CRM Company', 'hello@mycrm.com', '+1 555 1234', 'TAX-001', 'https://mycrm.com', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.companies);

-- =============================================================================
-- LINK ALL AUTH USERS TO THIS COMPANY AS ADMIN
-- =============================================================================
INSERT INTO public.profiles (id, company_id, full_name, role, created_at, updated_at)
SELECT u.id, '11111111-1111-1111-1111-111111111111'::uuid, COALESCE(u.raw_user_meta_data->>'full_name', u.email), 'admin', NOW(), NOW()
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = u.id);

UPDATE public.profiles SET company_id = '11111111-1111-1111-1111-111111111111'::uuid WHERE company_id IS NULL;

-- =============================================================================
-- ADD USERS TO COMPANY_USERS
-- =============================================================================
INSERT INTO public.company_users (company_id, user_id, role, created_at)
SELECT '11111111-1111-1111-1111-111111111111'::uuid, p.id, 'admin', NOW()
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.company_users WHERE user_id = p.id);

-- =============================================================================
-- SEED CURRENCIES
-- =============================================================================
INSERT INTO public.currencies (code, symbol, name) VALUES
  ('USD', '$', 'US Dollar'),
  ('EUR', '€', 'Euro'),
  ('GBP', '£', 'British Pound'),
  ('PKR', 'Rs', 'Pakistani Rupee'),
  ('AED', 'د.إ', 'UAE Dirham'),
  ('SAR', 'ر.س', 'Saudi Riyal'),
  ('CAD', 'C$', 'Canadian Dollar'),
  ('AUD', 'A$', 'Australian Dollar')
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- SEED SERVICES (using fixed company UUID)
-- =============================================================================
INSERT INTO public.services (id, company_id, name, description, base_price, unit_type, is_active, created_at, updated_at)
SELECT gen_random_uuid(), '11111111-1111-1111-1111-111111111111'::uuid, s.name, s.description, s.base_price, s.unit_type, s.is_active, NOW(), NOW()
FROM (VALUES
  ('Web Development', 'Full-stack web application development using modern frameworks', 150.00, 'hour', true),
  ('Logo Design', 'Professional logo design with 3 concepts and revisions', 500.00, 'project', true),
  ('SEO Optimization', 'Monthly SEO service with keyword research and reporting', 800.00, 'month', true),
  ('Content Writing', 'Blog posts, articles, and website copy', 100.00, 'hour', true),
  ('Mobile App Development', 'iOS and Android native app development', 200.00, 'hour', true),
  ('Business Consulting', 'Strategy and operations consulting', 300.00, 'hour', true)
) AS s(name, description, base_price, unit_type, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.services WHERE services.company_id = '11111111-1111-1111-1111-111111111111'::uuid AND services.name = s.name);

-- =============================================================================
-- SEED CLIENTS
-- =============================================================================
INSERT INTO public.clients (id, company_id, full_name, company_name, email, phone, website, country, notes, created_at, updated_at)
SELECT gen_random_uuid(), '11111111-1111-1111-1111-111111111111'::uuid, c.full_name, c.company_name, c.email, c.phone, c.website, c.country, c.notes, NOW(), NOW()
FROM (VALUES
  ('Acme Corporation', 'Acme Corp', 'contact@acme.test', '+1 555 0100', 'https://acme.test', 'United States', 'VIP customer since 2024'),
  ('Globex Industries', 'Globex', 'info@globex.test', '+44 20 7946 0958', 'https://globex.test', 'United Kingdom', 'Prefers email communication'),
  ('Initech Software', 'Initech', 'admin@initech.test', '+1 555 0200', NULL, 'Canada', 'Enterprise client'),
  ('Stark Industries', 'Stark', 'jarvis@stark.test', '+1 555 0300', 'https://stark.test', 'United States', 'High-budget projects'),
  ('Wayne Enterprises', 'Wayne Corp', 'b.wayne@wayne.test', '+1 555 0400', 'https://wayne.test', 'United States', 'Top-tier client')
) AS c(full_name, company_name, email, phone, website, country, notes)
WHERE NOT EXISTS (SELECT 1 FROM public.clients WHERE clients.company_id = '11111111-1111-1111-1111-111111111111'::uuid AND clients.full_name = c.full_name);

-- =============================================================================
-- SEED QUOTATIONS
-- =============================================================================
INSERT INTO public.quotations (id, company_id, client_id, quotation_number, status, issue_date, expiry_date, total_amount, notes, created_at, updated_at)
SELECT gen_random_uuid(), '11111111-1111-1111-1111-111111111111'::uuid, c.id, q.qnum, q.status, q.issue_date::date, q.expiry_date::date, q.total_amount, q.notes, NOW(), NOW()
FROM (VALUES
  ('Acme Corporation', 'QT-2026-001', 'Accepted', '2026-08-15', '2026-09-15', 4500.00, 'Website redesign - accepted'),
  ('Globex Industries', 'QT-2026-002', 'Sent', '2026-08-20', '2026-09-20', 1600.00, 'Logo and branding package'),
  ('Initech Software', 'QT-2026-003', 'Draft', '2026-09-01', NULL, 800.00, 'SEO services Q4'),
  ('Stark Industries', 'QT-2026-004', 'Rejected', '2026-08-10', '2026-09-10', 6000.00, 'Mobile app - too expensive')
) AS q(client_name, qnum, status, issue_date, expiry_date, total_amount, notes)
JOIN public.clients c ON c.full_name = q.client_name AND c.company_id = '11111111-1111-1111-1111-111111111111'::uuid
WHERE NOT EXISTS (SELECT 1 FROM public.quotations WHERE quotation_number = q.qnum);

-- =============================================================================
-- SEED INVOICES
-- =============================================================================
INSERT INTO public.invoices (id, company_id, client_id, invoice_number, status, issue_date, due_date, subtotal, total_amount, amount_paid, notes, created_at, updated_at)
SELECT gen_random_uuid(), '11111111-1111-1111-1111-111111111111'::uuid, c.id, i.inum, i.status, i.issue_date::date, i.due_date::date, i.total_amount, i.total_amount, i.amount_paid, i.notes, NOW(), NOW()
FROM (VALUES
  ('Acme Corporation', 'INV-2026-001', 'Paid', '2026-08-20', '2026-09-03', 4500.00, 4500.00, 'Paid in full on 2026-09-02'),
  ('Globex Industries', 'INV-2026-002', 'Sent', '2026-08-25', '2026-09-08', 1600.00, 0, 'Awaiting payment'),
  ('Stark Industries', 'INV-2026-003', 'Unpaid', '2026-09-01', '2026-09-15', 3200.00, 0, 'Consulting hours August'),
  ('Wayne Enterprises', 'INV-2026-004', 'Overdue', '2026-07-15', '2026-07-29', 1200.00, 0, 'Past due - follow up')
) AS i(client_name, inum, status, issue_date, due_date, total_amount, amount_paid, notes)
JOIN public.clients c ON c.full_name = i.client_name AND c.company_id = '11111111-1111-1111-1111-111111111111'::uuid
WHERE NOT EXISTS (SELECT 1 FROM public.invoices WHERE invoice_number = i.inum);

-- =============================================================================
-- SEED PAYMENT
-- =============================================================================
INSERT INTO public.invoice_payments (id, invoice_id, amount, payment_date, payment_method, reference_number, status, notes, created_at)
SELECT gen_random_uuid(), inv.id, 4500.00, '2026-09-02'::date, 'Bank Transfer', 'TXN-2026-001', 'Completed', 'Wire transfer received', NOW()
FROM public.invoices inv
WHERE inv.invoice_number = 'INV-2026-001'
AND NOT EXISTS (SELECT 1 FROM public.invoice_payments WHERE invoice_id = inv.id);

-- =============================================================================
-- VERIFICATION - Show what was inserted
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
