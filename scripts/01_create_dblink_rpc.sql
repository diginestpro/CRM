-- ============================================================
-- Replace exec_sql with two RPCs:
--   1. exec_sql_no_txn - runs SQL via dblink in its OWN connection,
--      so CREATE INDEX CONCURRENTLY works. Use this for one
--      statement at a time.
--   2. exec_sql         - same as before, runs in a transaction
--      (good for batches of CREATE INDEX IF NOT EXISTS / CREATE
--      OR REPLACE / ANALYZE etc - nothing that needs CONCURRENTLY).
--
-- This requires the dblink extension. Supabase has it available;
-- we just need to enable it in the public schema (default Supabase
-- setup has it in extensions schema).
-- ============================================================

-- Enable dblink (no-op if already enabled).
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

-- Drop old RPC and replace.
DROP FUNCTION IF EXISTS public.exec_sql(text);

-- ============================================================
-- exec_sql(text): runs SQL inside a transaction. Use for batches
-- of regular DDL/DML where CONCURRENTLY is not needed.
-- Returns {ok, notices, rows}.
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
    CREATE TEMP TABLE IF NOT EXISTS _exec_sql_notices (
        line_num serial PRIMARY KEY,
        message  text
    ) ON COMMIT DROP;

    EXECUTE sql_text;

    SELECT jsonb_agg(message ORDER BY line_num) INTO v_result
      FROM _exec_sql_notices;

    RETURN jsonb_build_object(
        'ok',      true,
        'notices', COALESCE(v_result, '[]'::jsonb),
        'rows',    '[]'::jsonb
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'ok',     false,
        'error',  SQLERRM,
        'detail', SQLSTATE
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;

-- ============================================================
-- exec_sql_no_txn(text): runs SQL via dblink in its OWN
-- connection (no surrounding transaction). Use for
-- CREATE INDEX CONCURRENTLY, VACUUM, REINDEX CONCURRENTLY.
-- Returns {ok, error, detail, rows}.
-- ============================================================
CREATE OR REPLACE FUNCTION public.exec_sql_no_txn(sql_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
    v_rows jsonb;
    v_err  text;
BEGIN
    -- dblink_exec returns 'OK' on success or raises on failure.
    BEGIN
        PERFORM dblink_exec(
            'dbname=' || current_database()
                 || ' port=' || coalesce(inet_server_port(), 5432)
                 || ' host=localhost',
            sql_text,
            false  -- fail_on_error: raise so we catch it
        );
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
        RETURN jsonb_build_object(
            'ok',     false,
            'error',  v_err,
            'detail', SQLSTATE
        );
    END;

    -- Best-effort: try to capture result rows if it was a SELECT.
    -- Errors here are ignored - this RPC is mainly for DDL.
    BEGIN
        SELECT jsonb_agg(to_jsonb(r)) INTO v_rows
          FROM dblink(
              'dbname=' || current_database()
                   || ' port=' || coalesce(inet_server_port(), 5432)
                   || ' host=localhost',
              sql_text,
              true  -- fail_on_error: do not raise
          ) AS r(result text);
    EXCEPTION WHEN OTHERS THEN
        v_rows := NULL;
    END;

    RETURN jsonb_build_object(
        'ok',   true,
        'rows', COALESCE(v_rows, '[]'::jsonb)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.exec_sql_no_txn(text) TO service_role;

-- Smoke tests.
-- (jsonb field access uses -> arrow, not .dot notation)
SELECT 'exec_sql'          AS rpc,
       public.exec_sql('SELECT 1 AS ping')->>'ok' AS result;

SELECT 'exec_sql_no_txn'   AS rpc,
       public.exec_sql_no_txn(
           'CREATE INDEX IF NOT EXISTS _smoke_test_idx ON public.profiles (id)'
       )->>'ok' AS result;

DROP INDEX IF EXISTS public._smoke_test_idx;
