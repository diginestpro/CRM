@echo off
REM ============================================================
REM run_docker_backup.bat
REM
REM Convenience launcher for backup_schema_docker.ps1.
REM Run this from the project root (where package.json lives)
REM and follow the password prompt.
REM
REM Equivalent PowerShell call:
REM   powershell -ExecutionPolicy Bypass -File scripts\backup_schema_docker.ps1
REM ============================================================

setlocal
cd /d "%~dp0\.."

echo.
echo === Supabase fresh schema backup via Docker ===
echo Project : https://axnulmpsrnfoxjegsmie.supabase.co
echo Output  : .\backups\schema_<timestamp>.sql
echo.

powershell -ExecutionPolicy Bypass -NoProfile -File "scripts\backup_schema_docker.ps1"

endlocal
