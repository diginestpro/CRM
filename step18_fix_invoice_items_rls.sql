-- STEP 18: Fix RLS for invoice_items public read
-- This allows the public API to read invoice items

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Invoice Items Access" ON public.invoice_items;

-- Recreate with public read for invoice items (needed for the public pay page)
CREATE POLICY "Invoice Items Public Read" ON public.invoice_items FOR SELECT
  USING (true);

-- Keep the user write policy (existing users can manage)
CREATE POLICY "Invoice Items User Write" ON public.invoice_items FOR ALL
  USING (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE company_id = public.get_my_company_id()
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE company_id = public.get_my_company_id()
    )
  );
