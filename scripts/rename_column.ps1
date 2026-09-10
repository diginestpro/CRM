# Replace a literal token in a file with another token.
# Usage: rename_column.ps1 <path> <old> <new>
param([string]$Path, [string]$Old, [string]$New)
$content = Get-Content $Path -Raw
$count = ([regex]::Matches($content, [regex]::Escape($Old))).Count
if ($count -eq 0) {
  Write-Host "No occurrences of '$Old' in $Path" -ForegroundColor Yellow
  exit 0
}
$newContent = $content.Replace($Old, $New)
[System.IO.File]::WriteAllText($Path, $newContent)
Write-Host "$Path  →  replaced $count occurrence(s) of '$Old'"
