#Requires -RunAsAdministrator
<#
.SYNOPSIS
  UMS uninstall — stops service, removes firewall rules, optionally drops DB.
  Called by Inno Setup uninstaller.
#>
param(
  [string]$InstallDir = "C:\Program Files\UMS",
  [switch]$DropDatabase
)

$ErrorActionPreference = "Continue"

function Log($msg) { Write-Host "$(Get-Date -Format 'HH:mm:ss')  $msg" }

$NssmExe     = "$InstallDir\tools\nssm.exe"
$ServiceName = "UMSDashboard"

# ── 1. Stop and remove service ─────────────────────────────────────────────
Log "Stopping service $ServiceName..."
if (Test-Path $NssmExe) {
  & $NssmExe stop   $ServiceName 2>&1 | Out-Null
  & $NssmExe remove $ServiceName confirm 2>&1 | Out-Null
  Log "Service removed."
} else {
  Stop-Service  $ServiceName -Force -ErrorAction SilentlyContinue
  sc.exe delete $ServiceName | Out-Null
  Log "Service removed via sc.exe."
}

# ── 2. Remove firewall rules ────────────────────────────────────────────────
Log "Removing firewall rules..."
netsh advfirewall firewall delete rule name="UMS MQTT"      | Out-Null
netsh advfirewall firewall delete rule name="UMS Dashboard" | Out-Null
Log "Firewall rules removed."

# ── 3. Optional: drop database ─────────────────────────────────────────────
if ($DropDatabase) {
  Log "Dropping database..."
  $EnvFile = "$InstallDir\app\.env"
  if (Test-Path $EnvFile) {
    $DbUrl = (Get-Content $EnvFile | Where-Object { $_ -match "^DATABASE_URL=" }) -replace "^DATABASE_URL=", ""
    if ($DbUrl) {
      $NodeExe = (Get-Command node -ErrorAction SilentlyContinue)?.Source
      if ($NodeExe) {
        & $NodeExe "$InstallDir\app\node_modules\.bin\prisma" migrate reset --force --skip-seed 2>&1
        Log "Database dropped."
      }
    }
  }
}

Log "Uninstall complete."
exit 0
