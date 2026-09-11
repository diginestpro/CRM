-- ============================================================
-- ONE-TIME SETUP: Create an exec_sql RPC so PowerShell can
-- drive migrations via the service-role key.
--
-- This is the standard Supabase pattern for remote SQL
-- execution. The function is SECURITY DEFINER so it runs with
-- the table owner's privileges (full DDL). Only the service-role
-- key can call it.
-- ============================================================

CREATE OR REPLACE FUNCTION public.exec_sql(sql_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_result jsonb;
BEGIN
    -- Execute the SQL. We capture RAISE NOTICE messages into a
    -- temp table so we can return them to the caller.
    CREATE TEMP TABLE IF NOT EXISTS _exec_sql_notices (
        line_num serial PRIMARY KEY,
        message  text
    ) ON COMMIT DROP;

    -- Run the SQL block. Any DDL/DML works. Errors abort the
    -- transaction which is exactly what we want.
    EXECUTE sql_text;

    SELECT jsonb_agg(message ORDER BY line_num) INTO v_result
      FROM _exec_sql_notices;

    RETURN jsonb_build_object(
        'ok',     true,
        'notices', COALESCE(v_result, '[]'::jsonb)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'ok',    false,
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;

-- Smoke test: should return ok=true.
SELECT public.exec_sql('SELECT 1 AS ping') AS smoke_test;
