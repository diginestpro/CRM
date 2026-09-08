-- =============================================================================
-- FIX RLS POLICIES FOR PUBLIC INVOICE VIEWING
-- This allows /pay/[id] page to work without authentication
-- Run this in Supabase SQL Editor
-- =============================================================================

-- Drop existing problematic policies on invoices
DROP POLICY IF EXISTS "p" ON public.invoices;
DROP POLICY IF EXISTS "p_public" ON public.invoices;
DROP POLICY IF EXISTS "Public Invoice View" ON public.invoices;
DROP POLICY IF EXISTS "Invoices Policy" ON public.invoices;
DROP POLICY IF EXISTS "Allow invoice creation" ON public.invoices;
DROP POLICY IF EXISTS "Allow invoice update" ON public.invoices;

-- Create new policies:
-- 1. Allow EVERYONE (anon + authenticated) to SELECT invoices by ID (for public pay links)
CREATE POLICY "public_select_invoices" ON public.invoices
FOR SELECT USING (true);

-- 2. Allow authenticated users to INSERT/UPDATE/DELETE invoices in their company
CREATE POLICY "auth_all_invoices" ON public.invoices
FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- =============================================================================
-- Same for invoice_items (line items are joined to invoices)
-- =============================================================================
DROP POLICY IF EXISTS "p" ON public.invoice_items;
DROP POLICY IF EXISTS "p_public" ON public.invoice_items;

CREATE POLICY "public_select_invoice_items" ON public.invoice_items
FOR SELECT USING (true);

CREATE POLICY "auth_all_invoice_items" ON public.invoice_items
FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- =============================================================================
-- Companies (needed to show company name on public invoice)
-- =============================================================================
DROP POLICY IF EXISTS "p" ON public.companies;
CREATE POLICY "public_select_companies" ON public.companies
FOR SELECT USING (true);
CREATE POLICY "auth_all_companies" ON public.companies
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- Clients (needed to show client name on public invoice)
-- =============================================================================
DROP POLICY IF EXISTS "p" ON public.clients;
CREATE POLICY "public_select_clients" ON public.clients
FOR SELECT USING (true);
CREATE POLICY "auth_all_clients" ON public.clients
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- Invoice payments (allow public to record manual payments via pay link)
-- =============================================================================
DROP POLICY IF EXISTS "p" ON public.invoice_payments;
CREATE POLICY "public_insert_invoice_payments" ON public.invoice_payments
FOR INSERT WITH CHECK (true);
CREATE POLICY "auth_all_invoice_payments" ON public.invoice_payments
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- Make sure ALL tables have base grants
-- =============================================================================
GRANT SELECT ON public.invoices TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO anon, authenticated;
GRANT SELECT ON public.companies TO anon, authenticated;
GRANT SELECT ON public.clients TO anon, authenticated;
GRANT INSERT ON public.invoice_payments TO anon, authenticated;
GRANT UPDATE ON public.invoices TO anon, authenticated;

-- Allow anon to update invoice amount_paid/status when recording payment
GRANT UPDATE (amount_paid, status) ON public.invoices TO anon;

-- =============================================================================
-- Verify
-- =============================================================================
SELECT tablename, policyname, cmd
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('invoices', 'invoice_items', 'invoice_payments', 'companies', 'clients')
ORDER BY tablename, policyname;
