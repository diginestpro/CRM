-- ==========================================
-- 0006: Client Addresses (multiple addresses per client)
-- Safe to re-run.
-- ==========================================

-- 0) Helper: returns the calling user's company_id (re-created safely).
--    We use SECURITY DEFINER so it can read public.profiles regardless of RLS.
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_company_id() TO authenticated, anon;

-- 1) New table for client addresses (multi-tenant).
CREATE TABLE IF NOT EXISTS public.client_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    client_id  UUID REFERENCES public.clients(id)  ON DELETE CASCADE,
    label        TEXT,
    street       TEXT,
    city         TEXT,
    state        TEXT,
    postal_code  TEXT,
    country      TEXT,
    is_default   BOOLEAN DEFAULT false,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_addresses_client  ON public.client_addresses(client_id);
CREATE INDEX IF NOT EXISTS idx_client_addresses_company ON public.client_addresses(company_id);

-- 2) New column on invoices: which address should be shown for this invoice?
ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS selected_address_id UUID
    REFERENCES public.client_addresses(id) ON DELETE SET NULL;

-- 3) New column on clients: per-client allowed gateways.
--    NULL = all active gateways are allowed.
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

-- 4) RLS for client_addresses (multi-tenant).
ALTER TABLE public.client_addresses ENABLE ROW LEVEL SECURITY;

-- Drop pre-existing policies if they exist (idempotent).
DROP POLICY IF EXISTS "Client Addresses Access" ON public.client_addresses;
DROP POLICY IF EXISTS "Public Client Address View" ON public.client_addresses;

-- Authenticated users can only see addresses from their own company.
CREATE POLICY "Client Addresses Access"
    ON public.client_addresses
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.company_id = client_addresses.company_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.company_id = client_addresses.company_id
        )
    );

-- Public SELECT: only allow reading an address when it is referenced by a
-- published invoice (so the /pay/[id] page can show the chosen bill-to).
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

-- 5) Helpful analytic view (optional) ---------------------------------
-- SELECT * FROM public.client_addresses;