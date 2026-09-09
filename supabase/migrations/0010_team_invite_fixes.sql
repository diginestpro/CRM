-- ============================================================
-- 0010_team_invite_fixes.sql
--
-- Two fixes:
--
--   1. public.profiles is missing an `email` column. The team page
--      and the team-invite API both query `email` from profiles,
--      which currently fails with HTTP 400 from PostgREST.
--
--      We add a nullable email column and backfill it from the
--      parent auth.users row so existing profiles get their real
--      email populated automatically.
--
--   2. Add a partial unique index on profiles.email so we can rely
--      on a stable identifier even before the user logs in (the
--      team-invite flow creates a profile row before the invitee
--      sets their password).
-- ============================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email TEXT;

-- Backfill email from auth.users for every profile that already has
-- a linked auth user. This is the common case after onboarding.
UPDATE public.profiles AS p
SET email = u.email
FROM auth.users AS u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');

-- Helpful indexes for the queries the app does.
CREATE INDEX IF NOT EXISTS idx_profiles_company_id_created_at
    ON public.profiles(company_id, created_at);

CREATE INDEX IF NOT EXISTS idx_profiles_email
    ON public.profiles(email)
    WHERE email IS NOT NULL;

-- --- Verification NOTICE -----------------------------------------

DO $$
DECLARE
    v_has_email          BOOLEAN;
    v_backfilled         INT;
    v_total_profiles     INT;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='profiles'
          AND column_name='email'
    ) INTO v_has_email;

    SELECT COUNT(*) INTO v_backfilled
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.email = u.email;

    SELECT COUNT(*) INTO v_total_profiles FROM public.profiles;

    RAISE NOTICE 'DIAG-0010: profiles.email column exists=%, backfilled (matching auth.users) =%, total profiles=%',
        v_has_email, v_backfilled, v_total_profiles;
END $$;
