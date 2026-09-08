-- STEP 3: Seed currencies
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
