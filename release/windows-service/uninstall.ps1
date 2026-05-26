param(
  [string]$InstallDir = "$env:ProgramFiles\VOLTAGETEST",
  [string]$DataDir = "$env:ProgramData\VOLTAGETEST",
  [string]$ServiceName = "VOLTAGETESTDashboard",
  [switch]$PurgeData
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (Get-Command nssm -ErrorAction SilentlyContinue) {
  nssm stop $ServiceName 2>$null | Out-Null
  nssm remove $ServiceName confirm 2>$null | Out-Null
}

if (Test-Path $InstallDir) {
  Remove-Item -Recurse -Force -LiteralPath $InstallDir
}

if ($PurgeData -and (Test-Path $DataDir)) {
  Remove-Item -Recurse -Force -LiteralPath $DataDir
} else {
  Write-Host "Customer data preserved at $DataDir"
}
