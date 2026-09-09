-- ============================================================
-- 0008_seed_head_office.sql
--
-- Optional one-time seed: for every company that has top-level
-- address columns filled in (companies.address / city / state /
-- zip / country) AND no rows yet in company_addresses, insert a
-- single "Head Office" row using those values, marked as default.
--
-- This makes the new "From Address" picker non-empty from day one
-- without forcing the user to type in their address again.
--
-- Idempotent: if a company already has at least one
-- company_addresses row, we leave it alone (the user may have
-- already set things up via Settings -> Company -> Addresses).
-- ============================================================

INSERT INTO public.company_addresses (
    company_id,
    address_name,
    street,
    city,
    state,
    postal_code,
    country,
    is_default,
    created_at,
    updated_at
)
SELECT
    c.id,
    'Head Office',
    c.address,
    c.city,
    c.state,
    c.zip,
    c.country,
    TRUE,
    NOW(),
    NOW()
FROM public.companies c
WHERE
    -- Has at least one address field populated
    (c.address IS NOT NULL AND c.address <> '')
    OR (c.city IS NOT NULL AND c.city <> '')
    OR (c.country IS NOT NULL AND c.country <> '')
    -- ...and does not yet have any office in company_addresses
    AND NOT EXISTS (
        SELECT 1 FROM public.company_addresses ca
        WHERE ca.company_id = c.id
    );

-- Verification NOTICE
DO $$
DECLARE
    v_total INT;
BEGIN
    SELECT COUNT(*) INTO v_total FROM public.company_addresses;
    RAISE NOTICE 'DIAG-0008: company_addresses rows after seed = %', v_total;
END $$;
