# Quick verification of a backup file: counts objects in it.
param([string]$Path)
$content = Get-Content $Path -Raw

Write-Host ""
Write-Host "=== Backup verification ==="
Write-Host "File : $Path"
Write-Host "Size : $([math]::Round((Get-Item $Path).Length/1KB,1)) KB"
Write-Host ""
Write-Host "Object counts (parsed from CREATE statements):"
Write-Host ("  CREATE TABLE         : {0}" -f ([regex]::Matches($content, "CREATE TABLE public\.") ).Count)
Write-Host ("  CREATE FUNCTION      : {0}" -f ([regex]::Matches($content, "CREATE FUNCTION"          ) ).Count)
Write-Host ("  CREATE TRIGGER       : {0}" -f ([regex]::Matches($content, "CREATE TRIGGER"           ) ).Count)
Write-Host ("  CREATE VIEW          : {0}" -f ([regex]::Matches($content, "CREATE VIEW"              ) ).Count)
Write-Host ("  CREATE POLICY        : {0}" -f ([regex]::Matches($content, "CREATE POLICY"            ) ).Count)
Write-Host ("  CREATE INDEX         : {0}" -f ([regex]::Matches($content, "CREATE INDEX"             ) ).Count)
Write-Host ("  ALTER TABLE ... FK   : {0}" -f ([regex]::Matches($content, "FOREIGN KEY"              ) ).Count)
Write-Host ""
Write-Host "Tables captured:"
[regex]::Matches($content, "CREATE TABLE public\.([a-zA-Z0-9_]+)") |
  ForEach-Object { $_.Groups[1].Value } |
  Sort-Object -Unique |
  ForEach-Object { Write-Host "  - public.$_" }
