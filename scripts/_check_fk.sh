#!/bin/bash
# Check whether foreign keys exist between invoice_items and services
# (and between invoice_items and invoices, and between quotation_items
# and services / invoices). PostgREST needs real FK constraints for
# embedded-resource joins to work.
set -e

DB_HOST="$1"

IP=$(getent ahosts "$DB_HOST" | awk '{print $1}' | grep -E '^[0-9a-fA-F:]+$' | head -n1)
if [ -z "$IP" ]; then echo "Could not resolve $DB_HOST"; exit 1; fi

PGPASSWORD="$PGPASSWORD" psql -h "$IP" -p 5432 -U postgres -d postgres -A -t <<'SQL'
-- Invoice items FKs
SELECT 'invoice_items FKs:' AS info;
SELECT tc.table_name, kcu.column_name, ccu.table_name AS fk_table, ccu.column_name AS fk_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
 WHERE tc.table_schema = 'public'
   AND tc.constraint_type = 'FOREIGN KEY'
   AND tc.table_name IN ('invoice_items', 'quotation_items', 'invoice_payments', 'payment_transactions')
 ORDER BY tc.table_name, kcu.column_name;

-- Any FKs pointing to services.id
SELECT 'All FKs referencing public.services:' AS info;
SELECT tc.table_name, kcu.column_name, ccu.table_name AS fk_table
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
 WHERE tc.table_schema = 'public'
   AND tc.constraint_type = 'FOREIGN KEY'
   AND ccu.table_name = 'services';
SQL
