# Convert CRLF -> LF in-place for the file paths passed as args.
# Used by backup_schema_docker.ps1 so the bash helper script we ship
# runs cleanly inside the postgres:15 container.
param([Parameter(ValueFromRemainingArguments=$true)] $paths)
foreach ($p in $paths) {
  if (-not (Test-Path $p)) { continue }
  $bytes = [System.IO.File]::ReadAllBytes($p)
  $out = New-Object System.Collections.Generic.List[byte]
  for ($i = 0; $i -lt $bytes.Length; $i++) {
    if ($bytes[$i] -eq 0x0D -and ($i + 1) -lt $bytes.Length -and $bytes[$i + 1] -eq 0x0A) {
      $out.Add(0x0A)          # strip CR, keep LF
      $i++                    # skip the LF too
    } else {
      $out.Add($bytes[$i])
    }
  }
  [System.IO.File]::WriteAllBytes($p, $out.ToArray())
  Write-Host "LF-normalized: $p ($($out.Count) bytes)"
}
