-- ============================================================
-- Migration 0020: Performance & Authentication Indexing
--
-- Purpose: Eliminate the slow-loading / database-response
-- bottleneck by adding covering indexes for every filter,
-- sort, and join the application issues. Also harden the
-- get_my_company_id() helper (used in every RLS policy) so
-- it does a single indexed lookup instead of a fallback
-- chain of seq scans.
--
-- All statements are IF NOT EXISTS / CREATE OR REPLACE so
-- the migration is safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Helper: enable pg_trgm for fast text search / ILIKE
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ------------------------------------------------------------
-- 1. AUTH & TENANCY — make get_my_company_id() BLAZING fast
-- ------------------------------------------------------------
--
-- Right now get_my_company_id() does:
--   1) SELECT FROM company_users WHERE user_id = auth.uid()
--   2) If NULL, SELECT FROM profiles WHERE id = auth.uid()
-- Without an index on company_users.user_id the FIRST query
-- seq-scans the whole table on every RLS check (i.e. every
-- row of every read of every table). Adding these two indexes
-- turns it into an index-only lookup.
-- ------------------------------------------------------------

-- company_users lookup by user_id (used in get_my_company_id)
CREATE INDEX IF NOT EXISTS idx_company_users_user_id
    ON public.company_users (user_id);

-- profiles lookup by id (PK already covers it but we want a
-- covering index that includes company_id so the helper can
-- satisfy the query without hitting the heap)
CREATE INDEX IF NOT EXISTS idx_profiles_company_lookup
    ON public.profiles (id)
    INCLUDE (company_id)
    WHERE company_id IS NOT NULL;

-- Replace the helper. Single query, indexed, STABLE so the
-- planner can cache the result within a statement, and
-- PARALLEL SAFE so it can run in parallel workers.
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    SELECT company_id
      FROM public.profiles
     WHERE id = auth.uid()
     LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_company_id() TO authenticated, anon;

-- ------------------------------------------------------------
-- 2. CRM CORE TABLES — company_id + sort-by-created_at covers
--    every "list of X for my company" page.
-- ------------------------------------------------------------

-- clients
CREATE INDEX IF NOT EXISTS idx_clients_company_created
    ON public.clients (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_company_archived_created
    ON public.clients (company_id, is_archived, created_at DESC)
    WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_clients_company_email
    ON public.clients (company_id, email)
    WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_company_name_trgm
    ON public.clients USING gin (full_name gin_trgm_ops)
    WHERE company_id IS NOT NULL;

-- client_addresses
CREATE INDEX IF NOT EXISTS idx_client_addresses_client_default
    ON public.client_addresses (client_id, is_default)
    WHERE is_default = true;

-- services
CREATE INDEX IF NOT EXISTS idx_services_company_active
    ON public.services (company_id, is_active)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_services_company_created
    ON public.services (company_id, created_at DESC);

-- quotations
CREATE INDEX IF NOT EXISTS idx_quotations_company_status_created
    ON public.quotations (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_company_client
    ON public.quotations (company_id, client_id);
CREATE INDEX IF NOT EXISTS idx_quotations_client
    ON public.quotations (client_id);

-- quotation_items (also covers the "all items for this quotation" page)
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation
    ON public.quotation_items (quotation_id);

-- invoices — the hot table
CREATE INDEX IF NOT EXISTS idx_invoices_company_status_created
    ON public.invoices (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_company_due_date
    ON public.invoices (company_id, due_date)
    WHERE status IN ('Unpaid', 'Overdue', 'Partial', 'Sent');
CREATE INDEX IF NOT EXISTS idx_invoices_company_invoice_number
    ON public.invoices (company_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_client
    ON public.invoices (client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_quotation
    ON public.invoices (quotation_id)
    WHERE quotation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_company_client_created
    ON public.invoices (company_id, client_id, created_at DESC);

-- invoice_items
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
    ON public.invoice_items (invoice_id);

-- ------------------------------------------------------------
-- 3. PAYMENTS — invoice joins + status / date filters
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice
    ON public.invoice_payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_status_date
    ON public.invoice_payments (status, payment_date DESC)
    WHERE status = 'Completed';
CREATE INDEX IF NOT EXISTS idx_invoice_payments_company_status
    ON public.invoice_payments (status)
    INCLUDE (amount, payment_date)
    WHERE status = 'Completed';

CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice
    ON public.payment_transactions (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created
    ON public.payment_transactions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_methods_invoice_method
    ON public.invoice_payment_methods (invoice_id, payment_method)
    WHERE payment_method IS NOT NULL;

-- payment_gateways: almost always filtered by company + active
CREATE INDEX IF NOT EXISTS idx_payment_gateways_company_active
    ON public.payment_gateways (company_id, is_active)
    WHERE is_active = true;

-- payment_reminders
-- NOTE: live DB schema as of 2026-09-10 has NO due_date column
-- on payment_reminders (only sent_at). Index on what exists.
DO $pr$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='payment_reminders'
           AND column_name='due_date'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_payment_reminders_company_status_due
            ON public.payment_reminders (company_id, status, due_date);
    ELSE
        -- Fallback: index on (company_id, status, sent_at) which is what
        -- the reminder queue actually filters on.
        CREATE INDEX IF NOT EXISTS idx_payment_reminders_company_status_sent
            ON public.payment_reminders (company_id, status, sent_at DESC NULLS LAST);
        RAISE NOTICE 'NOTICE 0020-G: payment_reminders.due_date missing - used sent_at fallback';
    END IF;
END $pr$;

-- ------------------------------------------------------------
-- 4. COMM / LOGS
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_smtp_settings_company
    ON public.smtp_settings (company_id);

CREATE INDEX IF NOT EXISTS idx_email_logs_company_created
    ON public.email_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_company_entity
    ON public.activity_logs (company_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_company_created
    ON public.activity_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON public.notifications (user_id, is_read, created_at DESC)
    WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_company_addresses_company_default
    ON public.company_addresses (company_id, is_default)
    WHERE is_default = true;

-- ------------------------------------------------------------
-- 5. ANALYZE — refresh planner stats so the new indexes
--    get used immediately.
-- ------------------------------------------------------------
ANALYZE public.profiles;
ANALYZE public.company_users;
ANALYZE public.clients;
ANALYZE public.client_addresses;
ANALYZE public.services;
ANALYZE public.quotations;
ANALYZE public.quotation_items;
ANALYZE public.invoices;
ANALYZE public.invoice_items;
ANALYZE public.invoice_payments;
ANALYZE public.payment_transactions;
ANALYZE public.invoice_payment_methods;
ANALYZE public.payment_gateways;
ANALYZE public.payment_reminders;
ANALYZE public.smtp_settings;
ANALYZE public.email_logs;
ANALYZE public.activity_logs;
ANALYZE public.notifications;
ANALYZE public.company_addresses;

-- ------------------------------------------------------------
-- 6. Diagnostic NOTICEs
-- ------------------------------------------------------------
DO $$
DECLARE
    v_get_my_company BOOLEAN;
    v_idx_cu        BOOLEAN;
    v_idx_clients   BOOLEAN;
    v_idx_invoices  BOOLEAN;
    v_idx_payments  BOOLEAN;
    v_idx_trgm      BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM pg_proc p
                     JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname='public' AND p.proname='get_my_company_id')
      INTO v_get_my_company;
    SELECT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE schemaname='public' AND indexname='idx_company_users_user_id')
      INTO v_idx_cu;
    SELECT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE schemaname='public' AND indexname='idx_clients_company_created')
      INTO v_idx_clients;
    SELECT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE schemaname='public' AND indexname='idx_invoices_company_status_created')
      INTO v_idx_invoices;
    SELECT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE schemaname='public' AND indexname='idx_invoice_payments_status_date')
      INTO v_idx_payments;
    SELECT EXISTS (SELECT 1 FROM pg_indexes
                    WHERE schemaname='public' AND indexname='idx_clients_company_name_trgm')
      INTO v_idx_trgm;

    RAISE NOTICE 'NOTICE 0020-A: get_my_company_id helper present=%', v_get_my_company;
    RAISE NOTICE 'NOTICE 0020-B: idx_company_users_user_id=%', v_idx_cu;
    RAISE NOTICE 'NOTICE 0020-C: idx_clients_company_created=%', v_idx_clients;
    RAISE NOTICE 'NOTICE 0020-D: idx_invoices_company_status_created=%', v_idx_invoices;
    RAISE NOTICE 'NOTICE 0020-E: idx_invoice_payments_status_date=%', v_idx_payments;
    RAISE NOTICE 'NOTICE 0020-F: idx_clients_company_name_trgm=%', v_idx_trgm;
END $$;


