-- STEP 1: Create company and link all users
DO $$
DECLARE
  v_user_id UUID;
  v_company_id UUID;
BEGIN
  -- Create company if none exists
  SELECT id INTO v_company_id FROM public.companies LIMIT 1;
  IF v_company_id IS NULL THEN
    INSERT INTO public.companies (name, email, phone)
    VALUES ('My Test Company', 'test@example.com', '+1 555 0000')
    RETURNING id INTO v_company_id;
    RAISE NOTICE 'Company created: %', v_company_id;
  ELSE
    RAISE NOTICE 'Using existing company: %', v_company_id;
  END IF;

  -- Link ALL existing auth users to this company as admin
  FOR v_user_id IN SELECT id FROM auth.users LOOP
    INSERT INTO public.profiles (id, company_id, full_name, role)
    VALUES (v_user_id, v_company_id, 'Admin User', 'admin')
    ON CONFLICT (id) DO UPDATE SET company_id = v_company_id, role = 'admin';
    RAISE NOTICE 'Profile linked for user: %', v_user_id;
  END LOOP;
END $$;
