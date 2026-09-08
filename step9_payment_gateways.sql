-- Add unique constraint on (company_id, gateway_name) if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_gateways_company_name_unique'
  ) THEN
    ALTER TABLE public.payment_gateways
      ADD CONSTRAINT payment_gateways_company_name_unique UNIQUE (company_id, gateway_name);
  END IF;
END $$;

-- STEP 9: Seed payment_gateways table
-- This populates the payment_gateways table with Stripe, PayPal, and SafePay
-- for your company, so they appear in Settings → Payment Gateways.

DO $$
DECLARE
  v_company_id UUID;
BEGIN
  -- Get the first company ID (adjust this query if you have multiple companies)
  SELECT id INTO v_company_id FROM public.companies LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'No company found. Please create a company first.';
    RETURN;
  END IF;

  -- Insert/Update Stripe gateway
  INSERT INTO public.payment_gateways (company_id, gateway_name, api_key, secret_key, webhook_secret, is_active, config)
  VALUES (v_company_id, 'stripe', '', '', '', true, '{"display_name": "Stripe", "description": "Cards, Apple Pay, Google Pay"}'::jsonb)
  ON CONFLICT (company_id, gateway_name) DO NOTHING;

  -- Insert/Update PayPal gateway
  INSERT INTO public.payment_gateways (company_id, gateway_name, api_key, secret_key, webhook_secret, is_active, config)
  VALUES (v_company_id, 'paypal', '', '', '', true, '{"display_name": "PayPal", "description": "PayPal balance and Credit Cards"}'::jsonb)
  ON CONFLICT (company_id, gateway_name) DO NOTHING;

  -- Insert/Update SafePay gateway
  INSERT INTO public.payment_gateways (company_id, gateway_name, api_key, secret_key, webhook_secret, is_active, config)
  VALUES (v_company_id, 'safepay', '', '', '', true, '{"display_name": "SafePay", "description": "Pakistani payment gateway with international card support", "api_url": "https://sandbox.api.getsafepay.com"}'::jsonb)
  ON CONFLICT (company_id, gateway_name) DO NOTHING;

  -- Insert/Update App Settings
  INSERT INTO public.payment_gateways (company_id, gateway_name, is_active, config)
  VALUES (v_company_id, 'app_settings', true, '{"app_url": "http://localhost:3000"}'::jsonb)
  ON CONFLICT (company_id, gateway_name) DO NOTHING;

  RAISE NOTICE 'Payment gateways seeded for company %', v_company_id;
END $$;

-- Optional: Add RLS policy so users can only see their company's gateways
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their company payment gateways" ON public.payment_gateways;
CREATE POLICY "Users can view their company payment gateways"
  ON public.payment_gateways FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their company payment gateways" ON public.payment_gateways;
CREATE POLICY "Users can update their company payment gateways"
  ON public.payment_gateways FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Also allow the service role to read these (for the checkout API)
DROP POLICY IF EXISTS "Service role can read payment gateways" ON public.payment_gateways;
CREATE POLICY "Service role can read payment gateways"
  ON public.payment_gateways FOR SELECT
  TO service_role
  USING (true);
