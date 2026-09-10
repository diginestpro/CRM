@echo off
REM ============================================================
REM run_recalc_totals.bat
REM
REM Convenience launcher for the invoice-totals recalculation
REM script. Use after fixing the InvoiceForm to repair any
REM invoices that were saved with all-zero totals.
REM
REM Equivalent PowerShell call:
REM   docker run --rm --network=host -e PGPASSWORD=... -v %CD%:/work ^
REM     postgres:17 bash /work/scripts/_recalc_invoice_totals.sh ^
REM     "db.<project-ref>.supabase.co"
REM ============================================================

setlocal
cd /d "%~dp0\.."

echo.
echo === Recalculating invoice totals on cloud Supabase DB ===
echo Project : db.axnulmpsrnfoxjegsmie.supabase.co
echo.

if "%PGPASSWORD%"=="" (
    set /p PGPASSWORD="Enter Supabase DB password: "
)

docker run --rm --network=host -e PGPASSWORD=%PGPASSWORD% -v "%CD%:/work" postgres:17 ^
  bash /work/scripts/_recalc_invoice_totals.sh "db.axnulmpsrnfoxjegsmie.supabase.co"

endlocal
