param(
  [Parameter(Mandatory = $true)][string]$BackupDir,
  [string]$InstallDir = "$env:ProgramFiles\VOLTAGETEST",
  [string]$DataDir = "$env:ProgramData\VOLTAGETEST",
  [string]$ServiceName = "VOLTAGETESTDashboard"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$logDir = Join-Path $DataDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir "rollback.log"

function Log($Message) {
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -Encoding UTF8 -Path $logFile -Value $line
  Write-Host $Message
}

if (-not (Test-Path $BackupDir)) {
  throw "Missing rollback backup directory: $BackupDir"
}

Log "Starting VOLTAGETEST Windows rollback from $BackupDir"
if (Get-Command nssm -ErrorAction SilentlyContinue) {
  cmd /c "nssm stop $ServiceName 2>nul" | Out-Null
}

$appBackup = Join-Path $BackupDir "app"
$configBackup = Join-Path $BackupDir "voltagetest.env"

if (Test-Path $appBackup) {
  if (Test-Path $InstallDir) {
    Remove-Item -Recurse -Force -LiteralPath $InstallDir
  }
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  robocopy $appBackup $InstallDir /MIR | Out-Null
  if ($LASTEXITCODE -gt 7) { throw "robocopy rollback failed with exit code $LASTEXITCODE" }
}

if (Test-Path $configBackup) {
  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
  Copy-Item -Force -LiteralPath $configBackup -Destination (Join-Path $DataDir "voltagetest.env")
}

Log "VOLTAGETEST Windows rollback completed. Customer data preserved at $DataDir"
