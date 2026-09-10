$path = $args[0]
$bytes = [System.IO.File]::ReadAllBytes($path)
$hasCRLF = $false
for ($i = 0; $i -lt $bytes.Length - 1; $i++) {
  if ($bytes[$i] -eq 0x0D -and $bytes[$i + 1] -eq 0x0A) {
    $hasCRLF = $true; break
  }
}
Write-Host "File: $path"
Write-Host "Size: $($bytes.Length) bytes"
Write-Host "Has CRLF: $hasCRLF"
