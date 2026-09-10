param([string]$Path)
Get-ChildItem $Path -Recurse -Force |
  Where-Object { -not $_.PSIsContainer } |
  Select-Object FullName, Length
