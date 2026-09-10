#!/bin/bash
# ============================================================
# scripts/diagnose_db.sh
#
# Connects to your Supabase database (cloud or local) and prints
# the exact column list for every table the CRM uses. Then it
# compares each table's NOT NULL columns against what the app
# actually sends, and prints a clear list of mismatches.
#
# Usage:
#   # 1. Cloud Supabase (recommended):
#   export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"
#   bash scripts/diagnose_db.sh
#
#   # 2. Local Supabase via Docker:
#   docker run -d --name supabase-pg -p 54322:5432 \
#     -e POSTGRES_PASSWORD=postgres postgres:15
#   export DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres"
#   bash scripts/diagnose_db.sh
#
#   # 3. Supabase CLI local stack:
#   supabase start
#   # DATABASE_URL is printed by supabase start
# ============================================================

set -e

if [ -z "$DATABASE_URL" ]; then
  echo "❌ Set DATABASE_URL first."
  echo ""
  echo "   # Cloud Supabase (find this in Dashboard > Settings > Database)"
  echo "   export DATABASE_URL='postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres'"
  echo ""
  echo "   # Local Docker"
  echo "   docker run -d --name pg -p 54322:5432 -e POSTGRES_PASSWORD=postgres postgres:15"
  echo "   export DATABASE_URL='postgresql://postgres:postgres@localhost:54322/postgres'"
  exit 1
fi

echo "🔌 Connecting to $DATABASE_URL ..."
echo ""

# Run the diagnostic inline. We use psql variable substitution to
# avoid writing to a temp file.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -A -t <<'SQL'
-- ============================================================
-- 1. Print every column of every CRM table (name:type[! = NOT NULL])
-- ============================================================
DO $$
DECLARE
  rec TEXT;
  cols TEXT;
  app_uses TEXT[] := ARRAY[
    'companies', 'company_addresses',
    'profiles', 'company_users',
    'clients', 'client_addresses',
    'services',
    'invoices', 'invoice_items', 'invoice_payment_methods',
    'invoice_payments', 'payment_transactions',
    'quotations', 'quotation_items',
    'currencies', 'payment_gateways',
    'smtp_settings', 'email_log',
    'activity_logs', 'system_settings',
    'app_settings'
  ];
BEGIN
  RAISE NOTICE '==== TABLE SCHEMAS (LIVE DATABASE) ====';
  RAISE NOTICE 'Format: column:type[! = NOT NULL, ? = nullable]';
  RAISE NOTICE '';
  FOREACH rec IN ARRAY app_uses LOOP
    SELECT string_agg(
      column_name || ':' || data_type ||
      CASE
        WHEN is_nullable = 'NO' AND column_default IS NULL THEN '!NN'
        WHEN is_nullable = 'NO' THEN '!DF'  -- NOT NULL but has DEFAULT
        ELSE '?'
      END,
      ', ' ORDER BY ordinal_position
    )
    INTO cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = rec;
    IF cols IS NULL THEN
      RAISE NOTICE 'TABLE public.% : ❌ DOES NOT EXIST', rec;
    ELSE
      RAISE NOTICE 'TABLE public.% : %', rec, cols;
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 2. NOT NULL columns WITHOUT a default — the app MUST send these.
-- ============================================================
DO $$
DECLARE
  r RECORD;
  tbl TEXT;
  target_tables TEXT[] := ARRAY[
    'invoices', 'invoice_items', 'quotations', 'clients'
  ];
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==== REQUIRED FIELDS (NOT NULL, no default) ====';
  RAISE NOTICE 'The app form MUST send values for these columns or every insert will 400.';
  FOREACH tbl IN ARRAY target_tables LOOP
    RAISE NOTICE '-- public.% --', tbl;
    FOR r IN
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = tbl
        AND is_nullable = 'NO'
        AND column_default IS NULL
      ORDER BY ordinal_position
    LOOP
      RAISE NOTICE '    %, (%)', r.column_name, r.data_type;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- 3. The InvoiceForm payload keys (for reference).
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==== APP-SIDE INVOICE PAYLOAD ====';
  RAISE NOTICE 'Keys the InvoiceForm sends:';
  RAISE NOTICE '  client_id, invoice_number, status, due_date, notes,';
  RAISE NOTICE '  tax_rate, company_id, company_address_id,';
  RAISE NOTICE '  allows_partial_payments, min_payment,';
  RAISE NOTICE '  issue_date, currency_code, subtotal, tax_amount, total_amount, amount_paid.';
  RAISE NOTICE '';
  RAISE NOTICE 'Keys the InvoiceForm sends to invoice_items:';
  RAISE NOTICE '  invoice_id, service_id, description,';
  RAISE NOTICE '  quantity, unit_price, total_amount.';
END $$;
SQL

echo ""
echo "✅ Diagnostic complete. Compare the 'REQUIRED FIELDS' output"
echo "   against the 'APP-SIDE PAYLOAD' to find missing columns."