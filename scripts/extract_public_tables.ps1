# Extract every "CREATE TABLE public.<name>" block from a pg_dump file
# and print them concatenated, so we can read the actual DB schema.
param([string]$Path = "backups\schema_axnulmpsrnfoxjegsmie_20260910_152426.sql")

$lines = Get-Content $Path
$insidePublic = $false
$depth = 0
$buf = @()
$tables = @()

foreach ($l in $lines) {
  if ($l -match '^CREATE TABLE public\.([a-zA-Z0-9_]+) \($') {
    $insidePublic = $true
    $depth = 1
    $buf = @($l)
    continue
  }
  if ($insidePublic) {
    $buf += $l
    if ($l -match '^\)') { $depth--; if ($depth -le 0) { $insidePublic = $false; $tables += ,$buf; $buf = @() } }
    elseif ($l -match '\($' -and $l -notmatch 'CHECK') { $depth++ }
  }
}

Write-Host "Tables extracted: $($tables.Count)"
Write-Host ""
foreach ($t in $tables) {
  $name = ($t[0] -replace '^CREATE TABLE public\.([a-zA-Z0-9_]+) \($', '$1')
  Write-Host "==========================================="
  Write-Host "TABLE: public.$name"
  Write-Host "==========================================="
  $t | ForEach-Object { Write-Host $_ }
  Write-Host ""
}
