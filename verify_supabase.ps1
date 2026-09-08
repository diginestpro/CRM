$url = "https://axnulmpsrnfoxjegsmie.supabase.co/rest/v1"
$anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bnVsbXBzcm5mb3hqZWdzbWllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1NDQzNzQsImV4cCI6MjEwNDEyMDM3NH0.WPlB2BnnwluT4y1QX73vC04G7dE8vswaDoUtKQVIOwA"
$serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bnVsbXBzcm5mb3hqZWdzbWllIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODU0NDM3NCwiZXhwIjoyMTA0MTIwMzc0fQ.Nb-aJCzzHnvtgZBEuaquMX0a7LcsPT9-8B_-RhC6lPg"

$tables = @("clients", "services", "quotations", "invoices", "profiles", "companies")

foreach ($table in $tables) {
    Write-Host "Testing table: $table"
    try {
        $respAnon = Invoke-RestMethod -Uri "$url/$table?select=id&limit=1" -Headers @{"apikey"=$anonKey; "Authorization"="Bearer $anonKey"}
        Write-Host "  ✅ Anon Access: OK"
    } catch {
        Write-Host "  ❌ Anon Access: DENIED"
    }

    try {
        $respService = Invoke-RestMethod -Uri "$url/$table?select=id&limit=1" -Headers @{"apikey"=$serviceKey; "Authorization"="Bearer $serviceKey"}
        Write-Host "  ✅ Service Access: OK"
    } catch {
        Write-Host "  ❌ Service Access: DENIED"
    }
}
