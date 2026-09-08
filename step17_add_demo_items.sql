-- STEP 17: Add sample line items to invoices that have none
-- This is just demo data for the seed - replace with real items

DO $$
DECLARE
  v_invoice RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_invoice IN
    SELECT i.id, i.invoice_number, i.total_amount, i.company_id
    FROM public.invoices i
    WHERE NOT EXISTS (
      SELECT 1 FROM public.invoice_items ii WHERE ii.invoice_id = i.id
    )
  LOOP
    -- Insert a generic line item based on the invoice total
    INSERT INTO public.invoice_items (
      invoice_id,
      service_id,
      description,
      quantity,
      unit_price,
      total_amount,
      created_at
    ) VALUES (
      v_invoice.id,
      NULL,
      ''Professional Services - '' || v_invoice.invoice_number,
      1,
      v_invoice.total_amount,
      v_invoice.total_amount,
      NOW()
    );
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE ''Added line items to % invoices'', v_count;
END $$;
