param([int]$Port = 3303)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 5
if ($health.status -ne "ok") {
  throw "VOLTAGETEST health check failed."
}
Write-Host "VOLTAGETEST health check PASS"
