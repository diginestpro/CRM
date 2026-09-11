# Performance & Speed Guide

This document describes the performance work done on this CRM and how to
verify / extend it.

## TL;DR

The repo had migrations `0020_performance_indexes.sql` and
`0021_dashboard_stats_view.sql` already committed, but **none of their
indexes/views existed on the live Supabase DB** as of the
`2026-09-10` schema dump. The dashboard was failing on 2 of 4 hot
queries (`HTTP 404` on `v_dashboard_counts` / `v_dashboard_stats`)
and the list pages averaged **441–626 ms** per round-trip.

Applying migrations `0020 + 0021 + 0022 + 0023` brings:

| What | Before | After (expected) |
|---|---|---|
| `v_dashboard_counts` | HTTP 404 (broken) | HTTP 200, O(1) lookup |
| `v_dashboard_stats` | HTTP 404 (broken) | HTTP 200, materialised, refreshed on payment write |
| Invoices list (top 6) | ~626 ms | < 100 ms (covering index) |
| Invoices "needs attention" | ~531 ms | < 80 ms (partial covering index) |
| Clients list | ~441 ms | < 80 ms (covering index + trigram search) |
| Payments list | ~490 ms | < 80 ms (covering index) |
| `get_my_company_id()` per-row RLS check | PLPGSQL SECURITY DEFINER | SQL STABLE PARALLEL SAFE |

## How to apply (live DB)

1. Open **Supabase Dashboard → SQL Editor → New query**.
2. Paste the **entire** contents of
   [`scripts/apply_perf_migrations.sql`](scripts/apply_perf_migrations.sql).
3. Hit **Run**.
4. Scroll through the result grid:
   - The first SELECT shows what existed **before** (mostly `false`).
   - The `RAISE NOTICE` lines come from each migration as it runs.
   - The last two SELECTs show what exists **after** (all `true`)
     and the row counts of every important table + view.

The migration is **idempotent** — pasting it twice is safe and
creates no duplicates.

## How to verify after applying

```powershell
cd C:\path\to\CRM
powershell -ExecutionPolicy Bypass -File scripts\verify_performance_indexes.ps1
```

Output:
- Reachability check for every list-page view/table
- 10-run round-trip timings for the hottest queries
- Reminder to paste `scripts/explain_top_queries.sql` into the SQL
  Editor for full `EXPLAIN ANALYZE` plans

For query-plan level verification:

1. Open **SQL Editor** again.
2. Paste `scripts/explain_top_queries.sql`.
3. Hit **Run**.
4. Every plan should show `Index Scan` / `Index Only Scan`. Any
   `Seq Scan` on `invoices`, `clients`, `invoice_payments` or
   `quotations` indicates the planner is not using an index for
   that query and the corresponding migration may need adjustment.

## What each migration does

### `0020_performance_indexes.sql`
Hardens the `get_my_company_id()` RLS helper (single-query,
STABLE, PARALLEL SAFE so every row-level check becomes an
index-only lookup) and adds the most important single-column
and composite indexes for clients, services, quotations,
invoices, invoice_items, payments, payment transactions,
payment methods, gateways, reminders, SMTP, email logs,
activity logs, notifications, and company addresses.

### `0021_dashboard_stats_view.sql`
Adds two regular views:
- `v_dashboard_stats(company_id, revenue_all_time, revenue_this_month)`
- `v_dashboard_counts(company_id, clients_total, quotations_sent, ...)`

### `0022_more_performance_indexes.sql` (new in this PR)
Adds **covering** indexes (INCLUDE columns) for queries added
after 0020 was written. Indexes in 0020 are great for filtered
list pages; these new ones serve the unfiltered list page, the
admin payments / email pages, the overdue cron sweep, and the
clients search box, with no heap visits.

### `0023_dashboard_stats_cache.sql` (new in this PR)
Replaces the regular `v_dashboard_stats` view with a
**MATERIALIZED VIEW** so the per-render `SUM(amount)` becomes a
single-row lookup. Refreshed by:
- A trigger on `invoice_payments` (write-time, zero-stale)
- `pg_cron` every minute (safety net)
- Manual call: `SELECT refresh_dashboard_stats_cache();`

If you ever need to drop the trigger (heavy write load),
`pg_cron` keeps the cache fresh within 60 seconds.

## File map

```
supabase/migrations/0020_performance_indexes.sql       # 0020
supabase/migrations/0021_dashboard_stats_view.sql     # 0021
supabase/migrations/0022_more_performance_indexes.sql # 0022 (new)
supabase/migrations/0023_dashboard_stats_cache.sql    # 0023 (new)

scripts/apply_perf_migrations.sql                     # one-shot runner
scripts/verify_performance_indexes.ps1                # POST-apply check
scripts/explain_top_queries.sql                       # EXPLAIN plan inspector
```

## When to add a new index

1. Open **SQL Editor**.
2. Paste `scripts/explain_top_queries.sql`; copy / adapt the
   relevant query.
3. Add `EXPLAIN (ANALYZE, BUFFERS)` in front.
4. If the plan shows `Seq Scan` on a table with > 10 000 rows,
   add a covering index in a new migration file
   (`0024_…sql`) using the same `CONCURRENTLY IF NOT EXISTS`
   pattern as `0022`.
5. `ANALYZE <table>` at the bottom so the planner picks it up.
