-- ============================================
-- Migration 0004: Invoice tax + status constraints
-- ============================================

-- Ensure tax_amount and tax_rate columns exist on invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal DECIMAL(12, 2) DEFAULT 0;

-- Ensure line items have a tax_rate column
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5, 2) DEFAULT 0;

-- Backfill subtotal if null
UPDATE public.invoices
SET subtotal = COALESCE(total_amount, 0)
WHERE subtotal IS NULL;

-- Constrain status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_status_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_status_check
      CHECK (status IN ('Draft', 'Unpaid', 'Partial', 'Paid', 'Overdue', 'Cancelled'));
  END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices (due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices (status);
