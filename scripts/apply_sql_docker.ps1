# Apply a .sql file to the cloud Supabase DB via the postgres:17
# Docker container. We resolve the host to IPv4 (Supabase's direct DB
# hostname is IPv6-only) and connect with TLS + PGPASSWORD from -e.
#
# Usage:
#   powershell -File scripts\apply_sql_docker.ps1 `
#       -Password "..." `
#       -SqlFile "supabase\migrations\0016_company_and_profile_columns.sql"
param(
  [string]$Password,
  [Parameter(Mandatory=$true)][string]$SqlFile,
  [string]$ProjectRef = "axnulmpsrnfoxjegsmie",
  [string]$Image      = "postgres:17"
)

$ErrorActionPreference = "Stop"

# Find project root (dir that contains .env.local).
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
  if (Test-Path (Join-Path $c ".env.local")) { $projectRoot = $c; break }
}
if (-not $projectRoot) { throw "Could not locate .env.local" }
Set-Location $projectRoot

if (-not $Password) {
  $sec = Read-Host "Enter Supabase DB password" -AsSecureString
  $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}

$dbHost = "db.$ProjectRef.supabase.co"
$resolved = Join-Path $projectRoot $SqlFile
if (-not (Test-Path $resolved)) {
  $resolved = (Resolve-Path $SqlFile).Path
}
if (-not (Test-Path $resolved)) {
  throw "SQL file not found: $SqlFile"
}

# Normalize line endings to LF so bash inside the container is happy
powershell -ExecutionPolicy Bypass -NoProfile -File `
  (Join-Path $projectRoot "scripts\to_lf.ps1") $resolved | Out-Null

# Use a path the container can read. Since /work is the project root,
# the relative path inside the container is "/work/<SqlFile-as-relative>".
$relSql = $SqlFile -replace "\\", "/"
$containerPath = "/work/$relSql"

Write-Host ""
Write-Host "==> Applying SQL to $dbHost ..."
Write-Host "    File: $resolved"
Write-Host "    In-container: $containerPath"
Write-Host ""

docker run --rm --network=host -e PGPASSWORD="$Password" `
  -v "${projectRoot}:/work" `
  $Image `
  bash /work/scripts/_apply_sql_runtime.sh "$dbHost" "$containerPath"

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "✅ SQL applied successfully."
} else {
  Write-Host ""
  Write-Host "❌ SQL apply failed (exit $LASTEXITCODE)."
  exit $LASTEXITCODE
}

