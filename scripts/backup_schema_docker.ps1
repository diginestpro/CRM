<#
.SYNOPSIS
  Pulls a fresh schema backup (tables, views, functions, triggers, RLS,
  policies, indexes, constraints, sequences, grants) from your Supabase
  cloud database using a temporary postgres:15 Docker container that has
  pg_dump + psql. Output is a single .sql file.

.DESCRIPTION
  Method:
    1. Read NEXT_PUBLIC_SUPABASE_URL from .env.local
    2. Derive the DB host: db.<project-ref>.supabase.co
    3. Prompt for the Supabase DB password (never stored)
    4. Launch a one-shot postgres:15 container that connects to your
       cloud DB over TLS and runs pg_dump with --schema-only
    5. Copy the dump out of the container to ./backups/schema_<ts>.sql

.NOTES
  * Docker must be installed and the daemon running.
  * The DB password is found in Supabase Dashboard > Settings > Database.
    (You can also use the "Direct connection" string from that page.)
#>

param(
  [string]$Password    = "",
  [string]$Image       = "postgres:17"
)

$ErrorActionPreference = "Stop"

# ------------------------------------------------------------
# 0. Locate project root (the dir that contains .env.local).
#    Works whether you run the script from the project root,
#    from scripts/, or via the .bat launcher.
# ------------------------------------------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$candidates = @(
  (Resolve-Path "$ScriptDir\.."),
  (Resolve-Path "$ScriptDir\."),
  (Resolve-Path "."),
  (Resolve-Path ".."),
  (Resolve-Path ".\..")
) | ForEach-Object { $_.Path } | Sort-Object -Unique

$projectRoot = $null
foreach ($c in $candidates) {
  if (Test-Path (Join-Path $c ".env.local")) {
    $projectRoot = $c; break
  }
}
if (-not $projectRoot) { throw "Could not locate .env.local. Run from project root or scripts/." }

Set-Location $projectRoot
$EnvFile = Join-Path $projectRoot ".env.local"
$OutDir  = Join-Path $projectRoot "backups"

# ------------------------------------------------------------
# 1. Resolve project ref + URL from .env.local
# ------------------------------------------------------------
if (-not (Test-Path $EnvFile)) {
  throw "Env file not found: $EnvFile"
}
$envContent  = Get-Content $EnvFile -Raw
$supabaseUrl = ($envContent | Select-String -Pattern 'NEXT_PUBLIC_SUPABASE_URL\s*=\s*"?([^"\r\n]+)' ).Matches[0].Groups[1].Value

if (-not $supabaseUrl) { throw "Could not find NEXT_PUBLIC_SUPABASE_URL in $EnvFile" }

# url looks like: https://axnulmpsrnfoxjegsmie.supabase.co
$projectRef = ($supabaseUrl -replace '^https?://', '' -replace '\.supabase\.co.*$', '')
$dbHost     = "db.$projectRef.supabase.co"

Write-Host ""
Write-Host "==> Supabase project  : $projectRef"
Write-Host "==> DB host           : $dbHost"
Write-Host "==> Output dir        : $OutDir"
Write-Host ""

# ------------------------------------------------------------
# 2. Get password (prompt if not passed)
# ------------------------------------------------------------
if (-not $Password) {
  $sec = Read-Host "Enter your Supabase DB password (Settings > Database)" -AsSecureString
  $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}

# Build the libpq-style URL Supabase expects
$dbUrl = "postgresql://postgres:${Password}@${dbHost}:5432/postgres?sslmode=require"

# ------------------------------------------------------------
# 3. Make sure Docker is running
# ------------------------------------------------------------
try {
  docker info 2>&1 | Out-Null
} catch {
  throw "Docker is not available. Please start Docker Desktop and try again."
}

# ------------------------------------------------------------
# 4. Prepare output dir
# ------------------------------------------------------------
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
$stamp   = Get-Date -Format "yyyyMMdd_HHmmss"
$outFile = Join-Path $OutDir "schema_${projectRef}_${stamp}.sql"

# ------------------------------------------------------------
# 5. Run pg_dump inside a throwaway container
# ------------------------------------------------------------
Write-Host "==> Running pg_dump via Docker ($Image) ..."
Write-Host "    Output: $outFile"
Write-Host ""

$containerName = "crm-pgdump-$stamp"
$tempInProject = Join-Path $projectRoot "schema.sql"

# Clean any prior file in case of re-runs
if (Test-Path $tempInProject) { Remove-Item -Force $tempInProject }

# Run pg_dump inside the container. The bash helper ships as a real
# file (scripts/_pgdump_runtime.sh) so we don't have to inline-escape
# bash through PowerShell. We normalize it to LF on every run so CRLF
# caused by Windows-side edits never breaks the script inside Linux.
$helperPath = Join-Path $projectRoot "scripts\_pgdump_runtime.sh"
if (-not (Test-Path $helperPath)) {
  throw "Helper not found: $helperPath"
}
powershell -ExecutionPolicy Bypass -NoProfile -File `
  (Join-Path $projectRoot "scripts\to_lf.ps1") $helperPath | Out-Null

docker run --rm `
  --name $containerName `
  --network=host `
  -e PGPASSWORD="$Password" `
  -v "${projectRoot}:/work" `
  $Image `
  bash /work/scripts/_pgdump_runtime.sh "$dbHost" `
  2>&1 | Tee-Object -FilePath "$OutDir\last_run.log" | Out-Host

# Clean up the runtime helper so the source tree stays clean
Remove-Item -Force $helperPath

if (-not (Test-Path $tempInProject)) {
  Write-Host ""
  Write-Host "❌ pg_dump did not produce schema.sql. Last 30 log lines:"
  Get-Content "$OutDir\last_run.log" -Tail 30 | Out-Host
  throw "Backup failed. Inspect $OutDir\last_run.log"
}

Move-Item -Force $tempInProject $outFile

# ------------------------------------------------------------
# 6. Summary
# ------------------------------------------------------------
$size = (Get-Item $outFile).Length
Write-Host ""
Write-Host "✅ Schema backup complete."
Write-Host "   File : $outFile"
Write-Host "   Size : $([math]::Round($size/1KB, 1)) KB"
Write-Host ""
Write-Host "Tip: restore locally with"
Write-Host "   docker run --rm -i -v ${PWD}:/work postgres:15 `
  bash -lc `"psql -v ON_ERROR_STOP=1 -d \$SUPABASE_DB_URL -f /work/schema.sql`""
