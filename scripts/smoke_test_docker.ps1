# Verify that docker is installed, the daemon is up, and we can pull the
# postgres:15 image. Used to fail fast *before* the user is asked for the
# DB password. Does NOT connect to Supabase.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Docker smoke test ==="

# 1. Docker CLI
try {
  $ver = docker --version
  Write-Host "  [OK]   docker CLI: $ver"
} catch {
  throw "Docker CLI not found. Install Docker Desktop and try again."
}

# 2. Daemon
try {
  docker info 2>&1 | Out-Null
  Write-Host "  [OK]   docker daemon reachable"
} catch {
  throw "Docker daemon is not running. Start Docker Desktop and try again."
}

# 3. postgres:15 image
$have = docker image inspect postgres:15 2>$null
if ($have) {
  Write-Host "  [OK]   postgres:15 image already cached locally"
} else {
  Write-Host "  [..]   postgres:15 not cached, pulling (one-time)..."
  docker pull postgres:15 | Out-Host
  Write-Host "  [OK]   postgres:15 pulled"
}

Write-Host ""
Write-Host "All prerequisites satisfied. You can now run:"
Write-Host "    scripts\run_docker_backup.bat"
Write-Host ""
