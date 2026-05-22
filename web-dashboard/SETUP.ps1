#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Quick dev/test install — no Inno Setup needed.
  Installs UMS as a Windows service on the current machine using NSSM.
  Assumes Node.js and PostgreSQL are already installed.

.EXAMPLE
  .\SETUP.ps1
  .\SETUP.ps1 -DbPass "ums_password" -AdminPass "UMS@Local2026!" -HttpPort 3303
#>
param(
  [string]$DbHost    = "localhost",
  [string]$DbPort    = "5432",
  [string]$DbName    = "ums_local",
  [string]$DbUser    = "ums_user",
  [string]$DbPass    = "ums_password",
  [string]$AdminPass = "UMS@Local2026!",
  [string]$MqttPort  = "1883",
  [string]$HttpPort  = "3303"
)

$ErrorActionPreference = "Stop"
$AppDir = $PSScriptRoot

function Log($msg) { Write-Host "$(Get-Date -Format 'HH:mm:ss')  $msg" -ForegroundColor Cyan }
function Ok($msg)  { Write-Host "$(Get-Date -Format 'HH:mm:ss')  OK  $msg" -ForegroundColor Green }
function Err($msg) { Write-Host "$(Get-Date -Format 'HH:mm:ss')  ERR $msg" -ForegroundColor Red; exit 1 }

# ── Locate tools ───────────────────────────────────────────────────────────
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $NodeExe) { Err "Node.js not found. Install from https://nodejs.org" }
Ok "Node: $NodeExe ($( & $NodeExe --version ))"

$NssmExe = "$AppDir\installer\tools\nssm.exe"
if (-not (Test-Path $NssmExe)) {
  $NssmExe = (Get-Command nssm -ErrorAction SilentlyContinue)?.Source
  if (-not $NssmExe) { Err "NSSM not found. Download nssm.exe to installer\tools\ from https://nssm.cc" }
}
Ok "NSSM: $NssmExe"

# ── Install npm dependencies ───────────────────────────────────────────────
Log "Installing npm packages..."
Set-Location $AppDir
npm install --prefer-offline 2>&1 | Out-Null
Ok "npm install done."

# ── Generate auth token ────────────────────────────────────────────────────
$AuthToken = [System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

# ── Hash admin password ────────────────────────────────────────────────────
Log "Hashing admin password..."
$AdminHash = & $NodeExe -e "const b=require('./node_modules/bcryptjs');process.stdout.write(b.hashSync('$AdminPass',12));" 2>&1
Ok "Admin password hashed."

# ── Write .env ─────────────────────────────────────────────────────────────
Log "Writing .env..."
$DatabaseUrl = "postgresql://${DbUser}:${DbPass}@${DbHost}:${DbPort}/${DbName}"
@"
DATABASE_URL=$DatabaseUrl
UPS_AUTH_TOKEN=$AuthToken
ADMIN_PASSWORD_HASH=$AdminHash
MQTT_PORT=$MqttPort
PORT=$HttpPort
NODE_ENV=production
"@ | Out-File -FilePath "$AppDir\.env" -Encoding utf8
Ok ".env written."

# ── Run DB migrations ──────────────────────────────────────────────────────
Log "Running DB migrations..."
$env:DATABASE_URL = $DatabaseUrl
& $NodeExe "$AppDir\node_modules\.bin\prisma" db push --accept-data-loss
if ($LASTEXITCODE -ne 0) { Err "DB push failed. Check PostgreSQL is running and credentials are correct." }
Ok "DB ready."

# ── Build Next.js ──────────────────────────────────────────────────────────
Log "Building Next.js (this takes ~2 minutes)..."
npm run build
if ($LASTEXITCODE -ne 0) { Err "Build failed." }
Ok "Build done."

# ── Register NSSM service ──────────────────────────────────────────────────
Log "Registering Windows service..."
$ServiceName = "UMSDashboard"
& $NssmExe stop   $ServiceName 2>&1 | Out-Null
& $NssmExe remove $ServiceName confirm 2>&1 | Out-Null

& $NssmExe install $ServiceName $NodeExe "$AppDir\.next\standalone\server.js"
& $NssmExe set $ServiceName AppDirectory $AppDir
& $NssmExe set $ServiceName AppEnvironmentExtra `
    "DATABASE_URL=$DatabaseUrl" `
    "UPS_AUTH_TOKEN=$AuthToken" `
    "ADMIN_PASSWORD_HASH=$AdminHash" `
    "PORT=$HttpPort" `
    "MQTT_PORT=$MqttPort" `
    "NODE_ENV=production"
& $NssmExe set $ServiceName DisplayName "UPS Management System"
& $NssmExe set $ServiceName Start SERVICE_AUTO_START
& $NssmExe set $ServiceName AppStdout "$AppDir\logs\ums-stdout.log"
& $NssmExe set $ServiceName AppStderr "$AppDir\logs\ums-stderr.log"
& $NssmExe set $ServiceName AppRotateFiles 1
& $NssmExe set $ServiceName AppRotateBytes 10485760
New-Item -ItemType Directory -Force -Path "$AppDir\logs" | Out-Null

# ── Firewall ───────────────────────────────────────────────────────────────
Log "Opening firewall..."
netsh advfirewall firewall delete rule name="UMS MQTT"      2>&1 | Out-Null
netsh advfirewall firewall delete rule name="UMS Dashboard" 2>&1 | Out-Null
netsh advfirewall firewall add rule name="UMS MQTT"      protocol=TCP dir=in localport=$MqttPort action=allow | Out-Null
netsh advfirewall firewall add rule name="UMS Dashboard" protocol=TCP dir=in localport=$HttpPort  action=allow | Out-Null
Ok "Firewall rules added."

# ── Start service ──────────────────────────────────────────────────────────
Log "Starting service..."
& $NssmExe start $ServiceName
Start-Sleep -Seconds 4
$Status = (Get-Service $ServiceName -ErrorAction SilentlyContinue)?.Status
Ok "Service status: $Status"

Write-Host ""
Write-Host "  UMS installed successfully." -ForegroundColor Green
Write-Host "  Dashboard : http://localhost:$HttpPort" -ForegroundColor White
Write-Host "  MQTT      : mqtt://localhost:$MqttPort" -ForegroundColor White
Write-Host "  Admin pass: $AdminPass" -ForegroundColor Yellow
Write-Host ""
