-- =============================================================================
-- COMPLETE PERMISSIONS FIX
-- Run this once to grant all required permissions
-- =============================================================================

-- Grant schema access
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Grant table access to ALL roles
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- Grant sequence access (for UUID generation, etc.)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Make sure default privileges are set for FUTURE tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public 
GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;

-- Ensure RLS is on but policies allow access
-- (Your current policies should already work, this is just a safety check)
