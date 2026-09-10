-- =====================================================================
-- backup_schema_browser.sql
--
-- HOW TO USE (browser / SQL-Editor alternative when Docker isn't
-- available):
--
--   1. Open https://supabase.com/dashboard  ->  select your project
--   2. Left menu -> "SQL Editor" -> "+ New query"
--   3. Paste THIS ENTIRE FILE into the editor
--   4. Click "Run"
--   5. Copy the result rows (or "Download CSV") -> that is your
--      fresh schema backup: tables, columns, FKs, indexes, RLS,
--      policies, functions, triggers, sequences, grants, views.
--
-- READ-ONLY: does not modify your database.
-- =====================================================================


-- SECTION 1 / TABLES
SELECT 'TABLE' AS kind,
       table_schema AS schema,
       table_name AS name,
       COALESCE(obj_description((table_schema || '.' || table_name)::regclass, 'pg_class'), '') AS detail
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;


-- SECTION 2 / COLUMNS
SELECT 'COLUMN' AS kind,
       table_name AS schema,
       column_name AS name,
       data_type ||
         CASE WHEN character_maximum_length IS NOT NULL THEN '(' || character_maximum_length || ')'
              WHEN numeric_precision IS NOT NULL THEN '(' || numeric_precision ||
                   CASE WHEN numeric_scale IS NOT NULL THEN ',' || numeric_scale END || ')'
              ELSE '' END ||
         CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
         CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END AS detail
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;


-- SECTION 3 / PRIMARY KEYS
SELECT 'PK' AS kind,
       tc.table_schema AS schema,
       tc.table_name AS name,
       string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS detail
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
GROUP BY tc.table_schema, tc.table_name
ORDER BY tc.table_name;


-- SECTION 4 / FOREIGN KEYS
SELECT 'FK' AS kind,
       tc.table_schema AS schema,
       tc.table_name || '.' || string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS name,
       '-> ' || ccu.table_schema || '.' || ccu.table_name || '(' || ccu.column_name || ')' AS detail
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
GROUP BY tc.table_schema, tc.table_name, tc.constraint_name,
         ccu.table_schema, ccu.table_name, ccu.column_name
ORDER BY tc.table_name;


-- SECTION 5 / INDEXES (incl. UNIQUE)
SELECT 'INDEX' AS kind,
       schemaname AS schema,
       indexname AS name,
       tablename || ' (' ||
         string_agg(a.attname, ', ' ORDER BY array_position(i.indkey, a.attnum)) || ')' ||
         CASE WHEN i.indisunique THEN ' UNIQUE' ELSE '' END AS detail
FROM pg_indexes
JOIN pg_class ci ON ci.relname = indexname
JOIN pg_index i ON i.indexrelid = ci.oid
JOIN pg_namespace n ON n.oid = ci.relnamespace
JOIN pg_class ct ON ct.oid = i.indrelid
JOIN pg_attribute a ON a.attrelid = ct.oid AND a.attnum = ANY(i.indkey)
WHERE schemaname = 'public'
GROUP BY schemaname, indexname, tablename, i.indisunique
ORDER BY tablename, indexname;


-- SECTION 6 / CHECK CONSTRAINTS
SELECT 'CHECK' AS kind,
       n.nspname AS schema,
       con.conname AS name,
       pg_get_constraintdef(con.oid) AS detail
FROM pg_constraint con
JOIN pg_namespace n ON n.oid = con.connamespace
WHERE con.contype = 'c' AND n.nspname = 'public'
ORDER BY con.conname;


-- SECTION 7 / ROW LEVEL SECURITY
SELECT 'RLS' AS kind,
       schemaname AS schema,
       tablename AS name,
       'enabled=' || rowsecurity::text || ' force=' || forcerowsecurity::text AS detail
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;


-- SECTION 8 / RLS POLICIES
SELECT 'POLICY' AS kind,
       schemaname AS schema,
       tablename || ' / ' || policyname AS name,
       CASE cmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' WHEN '*' THEN 'ALL' ELSE cmd END
         || ' | roles=[' || roles::text || ']'
         || ' | using=' || COALESCE(qual, '')
         || ' | with='  || COALESCE(with_check, '') AS detail
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;


-- SECTION 9 / FUNCTIONS (signature + body)
SELECT 'FUNCTION' AS kind,
       n.nspname AS schema,
       p.proname AS name,
       pg_get_functiondef(p.oid) AS detail
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
ORDER BY p.proname;


-- SECTION 10 / TRIGGERS
SELECT 'TRIGGER' AS kind,
       event_object_schema AS schema,
       trigger_name || ' ON ' || event_object_table AS name,
       action_timing || ' ' || event_manipulation || ' ' || array_to_string(action_statement, ';') AS detail
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;


-- SECTION 11 / SEQUENCES
SELECT 'SEQUENCE' AS kind,
       sequence_schema AS schema,
       sequence_name AS name,
       'start=' || start_value || ' inc=' || increment AS detail
FROM information_schema.sequences
WHERE sequence_schema = 'public'
ORDER BY sequence_name;


-- SECTION 12 / GRANTS (table-level, non-default roles)
SELECT 'GRANT' AS kind,
       table_schema AS schema,
       grantee || ' ON ' || table_name AS name,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS detail
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee NOT IN ('postgres', 'PUBLIC')
GROUP BY table_schema, table_name, grantee
ORDER BY table_name, grantee;


-- SECTION 13 / VIEWS
SELECT 'VIEW' AS kind,
       table_schema AS schema,
       table_name AS name,
       view_definition AS detail
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;
