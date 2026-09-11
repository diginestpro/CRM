-- Diagnose why dblink failed. Run this in SQL Editor.
SELECT 'version' AS what, version() AS info;

-- Confirm dblink extension is installed and reachable.
SELECT extname, extversion FROM pg_extension WHERE extname = 'dblink';

-- Confirm the function exists with correct signature.
SELECT proname, pronargs, prosecdef, prorettype::regtype
  FROM pg_proc WHERE proname IN ('exec_sql', 'exec_sql_no_txn');

-- Run exec_sql_no_txn with a single CREATE INDEX (non-CONCURRENTLY) to
-- isolate whether the failure is about CONCURRENTLY or dblink itself.
SELECT public.exec_sql_no_txn(
    'CREATE INDEX IF NOT EXISTS _diag_idx ON public.profiles (id)'
) AS result;

DROP INDEX IF EXISTS public._diag_idx;

-- Try a simple SELECT through dblink to see the actual error.
SELECT public.exec_sql_no_txn('SELECT 1') AS result;

-- Show what dblink sees when connecting.
SELECT public.exec_sql_no_txn(
    'SELECT current_database() AS db, inet_server_port() AS port, current_user AS usr'
) AS result;
