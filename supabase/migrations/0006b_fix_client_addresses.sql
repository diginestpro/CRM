-- ==========================================
-- 0006b: defensive fix for "column company_id does not exist"
-- Run ONCE in the Supabase SQL editor. Drops + recreates the new bits
-- so a partial previous run cannot leave us in a broken state.
-- ==========================================

-- 0) Always (re)define the helper. It uses company_users first (which is
--    authoritative in this schema) and falls back to profiles.company_id.
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
BEGIN
  -- Path 1: company_users (always has company_id).
  BEGIN
    EXECUTE format('SELECT company_id FROM public.company_users WHERE user_id = $1 LIMIT 1')
      INTO v_company USING auth.uid();
    IF v_company IS NOT NULL THEN RETURN v_company; END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Path 2: profiles.company_id (may not exist in some forks of the schema).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'company_id'
  ) THEN
    EXECUTE 'SELECT company_id FROM public.profiles WHERE id = $1 LIMIT 1'
      INTO v_company USING auth.uid();
    IF v_company IS NOT NULL THEN RETURN v_company; END IF;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_company_id() TO authenticated, anon;

-- 1) Drop any leftover from a partial previous run.
DROP POLICY IF EXISTS "Client Addresses Access"   ON public.client_addresses;
DROP POLICY IF EXISTS "Public Client Address View" ON public.client_addresses;
DROP TABLE  IF EXISTS public.client_addresses CASCADE;
ALTER TABLE public.invoices  DROP COLUMN IF EXISTS selected_address_id;
ALTER TABLE public.clients   DROP COLUMN IF EXISTS allowed_gateways;

-- 2) Recreate the table fresh.
CREATE TABLE public.client_addresses (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    client_id   UUID REFERENCES public.clients(id)  ON DELETE CASCADE,
    label       TEXT,
    street      TEXT,
    city        TEXT,
    state       TEXT,
    postal_code TEXT,
    country     TEXT,
    is_default  BOOLEAN DEFAULT false,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_client_addresses_client  ON public.client_addresses(client_id);
CREATE INDEX idx_client_addresses_company ON public.client_addresses(company_id);

-- 3) Add new columns on existing tables (no IF NOT EXISTS for the array — wrap in DO).
ALTER TABLE public.invoices
    ADD COLUMN selected_address_id UUID
    REFERENCES public.client_addresses(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'clients'
      AND column_name  = 'allowed_gateways'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN allowed_gateways TEXT[] DEFAULT NULL;
  END IF;
END $$;

-- 4) RLS using only the helper function (NO direct column refs in USING).
ALTER TABLE public.client_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client Addresses Access"
    ON public.client_addresses
    FOR ALL
    TO authenticated
    USING      (company_id = public.get_my_company_id())
    WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "Public Client Address View"
    ON public.client_addresses
    FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            WHERE i.selected_address_id = client_addresses.id
        )
    );

-- 5) Sanity-check at the end: tell the user what they have.
DO $$
DECLARE
  v_clients_company   BOOLEAN;
  v_invoices_addr     BOOLEAN;
  v_clients_gateways  BOOLEAN;
  v_addr_tbl          BOOLEAN;
  v_helper            BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='company_id'
  ) INTO v_clients_company;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='invoices' AND column_name='selected_address_id'
  ) INTO v_invoices_addr;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clients' AND column_name='allowed_gateways'
  ) INTO v_clients_gateways;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='client_addresses'
  ) INTO v_addr_tbl;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_schema='public' AND routine_name='get_my_company_id'
  ) INTO v_helper;

  RAISE NOTICE 'DIAG: clients.company_id=%, invoices.selected_address_id=%, clients.allowed_gateways=%, table client_addresses=%, helper get_my_company_id=%',
    v_clients_company, v_invoices_addr, v_clients_gateways, v_addr_tbl, v_helper;
END $$;