-- STEP 2: Add users to company_users
INSERT INTO public.company_users (company_id, user_id, role)
SELECT c.id, p.id, 'admin'
FROM public.companies c
JOIN public.profiles p ON p.company_id = c.id
ON CONFLICT (company_id, user_id) DO NOTHING;
