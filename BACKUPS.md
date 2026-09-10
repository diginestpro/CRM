# Supabase Connection & Fresh Schema Backup

This project talks to a cloud Supabase project:

| Setting | Value |
|---|---|
| Project URL | `https://axnulmpsrnfoxjegsmie.supabase.co` |
| DB host | `db.axnulmpsrnfoxjegsmie.supabase.co` (port 5432, SSL required) |
| Config file | `.env.local` (read by Next.js at runtime) |

The `.env.local` already holds the `anon` and `service_role` keys, so the
**app is already wired up**. The scripts below are for *you* (developer)
to inspect / back up / restore the database.

---

## 1. Test the connection (no DB password needed)

From the project root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\test_supabase_connection.ps1
```

It pings PostgREST, Auth, Storage, and reads one row from `clients`
using the service-role key. Any `[FAIL]` line tells you exactly which
surface is broken.

---

## 2. Fresh schema backup — Docker method (recommended)

Requires Docker Desktop running. A throwaway `postgres:15` container is
spun up that has `pg_dump`, connects over TLS to your cloud DB and dumps
the whole schema (tables, views, functions, triggers, RLS, policies,
indexes, sequences, constraints — **no row data**).

### One-line (interactive)

```bat
scripts\run_docker_backup.bat
```

You'll be prompted for your **Supabase DB password** (find it at
`Dashboard → Settings → Database → Database password`). If you saved it
in Windows Credential Manager you can also pass it directly:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup_schema_docker.ps1 -Password "YOUR_DB_PASSWORD"
```

Output lands in:

```
backups\schema_axnulmpsrnfoxjegsmie_YYYYMMDD_HHMMSS.sql
```

### What it actually runs

```bash
docker run --rm -e PGPASSWORD=*** postgres:15 \
  bash -lc "pg_dump \
    'postgresql://postgres:***@db.axnulmpsrnfoxjegsmie.supabase.co:5432/postgres?sslmode=require' \
    --schema-only \
    --no-owner --no-privileges \
    --include-views --include-functions --include-triggers \
    -f /tmp/schema.sql"
```

`--schema-only` = no `COPY` blocks (no customer data). The flags
`--no-owner` / `--no-privileges` strip the role-specific GRANT noise so
the dump is portable across environments.

---

## 3. Fresh schema backup — Browser method (no Docker)

If you can't install Docker, open
**Supabase Dashboard → SQL Editor → New query**, paste the entire file
[`scripts/backup_schema_browser.sql`](scripts/backup_schema_browser.sql),
hit **Run**, then copy / "Download CSV" the result grid.

The query is **read-only**. It returns 13 labelled sections (TABLE,
COLUMN, PK, FK, INDEX, CHECK, RLS, POLICY, FUNCTION, TRIGGER,
SEQUENCE, GRANT, VIEW) — a complete textual snapshot of your schema
including function bodies.

---

## 4. Restore a backup

To replay the `.sql` dump into *any* Postgres (local docker, a staging
Supabase project, etc.):

```bash
docker run --rm -i -v %CD%:/work postgres:15 bash -lc \
  "psql -v ON_ERROR_STOP=1 -d postgresql://USER:PASS@HOST:5432/DB -f /work/backups/schema_axnulmpsrnfoxjegsmie_*.sql"
```

> ⚠️ The dump is **schema-only**, so restore is safe on an empty DB. On
> an already-populated DB you'll get `CREATE TABLE already exists`
> errors — drop the conflicting tables first, or load the dump into a
> fresh project.

---

## 5. Files added

| Path | Purpose |
|---|---|
| `scripts/test_supabase_connection.ps1` | REST / Auth / Storage / DB ping |
| `scripts/backup_schema_docker.ps1`   | `pg_dump --schema-only` via Docker |
| `scripts/run_docker_backup.bat`     | Double-clickable launcher for the above |
| `scripts/backup_schema_browser.sql` | Paste-into-SQL-Editor equivalent |
| `backups/`                          | Where dumps land (created on first run) |

---

## 6. Where to find things in Supabase Dashboard

- **DB password**        → Settings → Database → Database password
- **Direct connection**  → Settings → Database → Connection string → URI
- **Anon key**           → Settings → API → Project API keys → `anon`
- **Service-role key**   → Settings → API → Project API keys → `service_role`
- **SQL Editor**         → left menu → SQL Editor
- **Table editor**       → left menu → Table Editor
- **Backups (PITR)**     → Settings → Database → Backups
