-- ==========================================
-- Client Addresses (multiple addresses per client)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.client_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    label TEXT,                              -- e.g. "Head Office", "Billing"
    street TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_addresses_client ON public.client_addresses(client_id);
CREATE INDEX IF NOT EXISTS idx_client_addresses_company ON public.client_addresses(company_id);

-- Add selected address to invoices
ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS selected_address_id UUID REFERENCES public.client_addresses(id) ON DELETE SET NULL;

-- Add allowed gateways array to clients (NULL = all active gateways allowed)
ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS allowed_gateways TEXT[] DEFAULT NULL;

-- ==========================================
-- RLS for client_addresses (multi-tenant)
-- ==========================================

ALTER TABLE public.client_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Client Addresses Access" ON public.client_addresses;
CREATE POLICY "Client Addresses Access" ON public.client_addresses
    FOR ALL
    USING (company_id = public.get_my_company_id())
    WITH CHECK (company_id = public.get_my_company_id());

-- Public can read a client address when shown on a public invoice page.
-- We restrict to addresses that belong to an invoice (via selected_address_id)
-- by allowing SELECT when the address is referenced by an existing invoice.
DROP POLICY IF EXISTS "Public Client Address View" ON public.client_addresses;
CREATE POLICY "Public Client Address View" ON public.client_addresses
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.invoices i
            WHERE i.selected_address_id = client_addresses.id
        )
    );