param(
  [string]$SourceRoot = (Resolve-Path ".").Path,
  [string]$InstallDir = "$env:ProgramFiles\VOLTAGETEST",
  [string]$DataDir = "$env:ProgramData\VOLTAGETEST",
  [string]$LogDir = "$env:ProgramData\VOLTAGETEST\logs",
  [string]$ServiceName = "VOLTAGETESTDashboard",
  [int]$Port = 3303,
  [Parameter(Mandatory = $true)][string]$DatabaseUrl,
  [Parameter(Mandatory = $true)][string]$AdminPassword,
  [string]$AdminUser = "admin",
  [string]$AuthToken,
  [string]$LicensePublicKeyPem,
  [string]$LicensePublicKeyPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

Require-Command node
Require-Command npm
Require-Command nssm

if (-not $LicensePublicKeyPem -and $LicensePublicKeyPath) {
  $LicensePublicKeyPem = Get-Content -Raw -Path $LicensePublicKeyPath
}
if (-not $LicensePublicKeyPem) {
  throw "UMS_LICENSE_PUBLIC_KEY_PEM is required."
}

$validateKey = @"
const crypto = require('node:crypto');
const pem = process.env.UMS_LICENSE_PUBLIC_KEY_PEM.replace(/\\n/g, '\n').trim();
if (!pem || pem.includes('REPLACE_WITH') || pem.includes('...')) throw new Error('placeholder license public key');
const key = crypto.createPublicKey(pem);
if (key.asymmetricKeyType !== 'ed25519') throw new Error('license public key must be Ed25519');
"@
$env:UMS_LICENSE_PUBLIC_KEY_PEM = $LicensePublicKeyPem
node -e $validateKey

$SourceApp = Join-Path $SourceRoot "web-dashboard"
if (-not (Test-Path $SourceApp)) {
  throw "Cannot find web-dashboard under $SourceRoot"
}

New-Item -ItemType Directory -Force -Path $InstallDir, $DataDir, $LogDir, (Join-Path $DataDir "license"), (Join-Path $DataDir "backups") | Out-Null
robocopy $SourceApp $InstallDir /MIR /XD node_modules .next /XF .env | Out-Null
if ($LASTEXITCODE -gt 7) { throw "robocopy failed with exit code $LASTEXITCODE" }

Push-Location $InstallDir
try {
  npm ci
  npm run db:generate

  $hash = node -e "const b=require('bcryptjs');process.stdout.write(b.hashSync(process.argv[1],12));" $AdminPassword
  $token = if ($AuthToken) { $AuthToken } else { node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" }
  $escapedKey = $LicensePublicKeyPem.Trim().Replace("`r", "").Replace("`n", "\n")
  $envFile = Join-Path $DataDir "voltagetest.env"
  @(
    "NODE_ENV=production",
    "PORT=$Port",
    "DATABASE_URL=$DatabaseUrl",
    "UPS_AUTH_USERNAME=$AdminUser",
    "UPS_AUTH_PASSWORD_HASH=$hash",
    "UPS_AUTH_TOKEN=$token",
    "UMS_LICENSE_PUBLIC_KEY_PEM=$escapedKey",
    "UMS_LICENSE_DIR=$(Join-Path $DataDir "license")",
    "ENABLE_MANUAL_TELEMETRY_POST=true",
    "ENABLE_EMBEDDED_BROKER=false",
    "ENABLE_INPROCESS_WORKER=true"
  ) | Set-Content -Encoding UTF8 -Path $envFile

  $env:DATABASE_URL = $DatabaseUrl
  $env:UPS_AUTH_USERNAME = $AdminUser
  $env:UPS_AUTH_PASSWORD_HASH = $hash
  $env:UPS_AUTH_TOKEN = $token
  $env:UMS_LICENSE_DIR = Join-Path $DataDir "license"
  $env:PORT = "$Port"
  npm run build
  npm run db:migrate
  npm prune --omit=dev

  cmd /c "nssm stop $ServiceName 2>nul" | Out-Null
  cmd /c "nssm remove $ServiceName confirm 2>nul" | Out-Null
  nssm install $ServiceName (Get-Command node).Source ".next\standalone\server.js"
  nssm set $ServiceName AppDirectory $InstallDir
  nssm set $ServiceName AppStdout (Join-Path $LogDir "service.out.log")
  nssm set $ServiceName AppStderr (Join-Path $LogDir "service.err.log")
  nssm set $ServiceName AppEnvironmentExtra "NODE_ENV=production" "PORT=$Port" "DATABASE_URL=$DatabaseUrl" "UPS_AUTH_USERNAME=$AdminUser" "UPS_AUTH_PASSWORD_HASH=$hash" "UPS_AUTH_TOKEN=$token" "UMS_LICENSE_PUBLIC_KEY_PEM=$escapedKey" "UMS_LICENSE_DIR=$(Join-Path $DataDir "license")" "ENABLE_MANUAL_TELEMETRY_POST=true" "ENABLE_EMBEDDED_BROKER=false" "ENABLE_INPROCESS_WORKER=true"
  nssm start $ServiceName
}
finally {
  Pop-Location
}

for ($i = 0; $i -lt 30; $i++) {
  try {
    Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2 | Out-Null
    Write-Host "VOLTAGETEST Windows service installed and healthy."
    exit 0
  } catch {
    Start-Sleep -Seconds 2
  }
}
throw "VOLTAGETEST service did not become healthy."
