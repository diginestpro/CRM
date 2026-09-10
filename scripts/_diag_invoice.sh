#!/bin/bash
# Dump the current invoice row + items for a given invoice number so we
# can confirm the totals bug and the fix.
set -e

INVOICE_NUM="$1"
DB_HOST="$2"

IP=$(getent ahosts "$DB_HOST" | awk '{print $1}' | grep -E '^[0-9a-fA-F:]+$' | head -n1)
if [ -z "$IP" ]; then echo "Could not resolve $DB_HOST"; exit 1; fi

PGPASSWORD="$PGPASSWORD" psql -h "$IP" -p 5432 -U postgres -d postgres -A -t -v ON_ERROR_STOP=1 <<SQL
-- 1. Invoice row
SELECT 'INVOICE', id, invoice_number, company_id, client_id, status, issue_date, due_date,
       subtotal, tax_rate, tax_amount, total_amount, amount_paid, currency_code
  FROM public.invoices WHERE invoice_number = '$INVOICE_NUM' LIMIT 1;

-- 2. Items
SELECT 'ITEM', id, service_id, description, quantity, unit_price, total_amount
  FROM public.invoice_items
  WHERE invoice_id = (SELECT id FROM public.invoices WHERE invoice_number = '$INVOICE_NUM' LIMIT 1)
  ORDER BY created_at;
SQL
