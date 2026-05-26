param(
  [string]$EnvFile = "$env:ProgramData\VOLTAGETEST\voltagetest.env",
  [string]$BackupDir = "$env:ProgramData\VOLTAGETEST\backups"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  throw "Missing required command: pg_dump"
}
if (-not (Test-Path $EnvFile)) {
  throw "Missing environment file: $EnvFile"
}

$databaseUrl = (Get-Content $EnvFile | Where-Object { $_ -like "DATABASE_URL=*" } | Select-Object -First 1).Substring("DATABASE_URL=".Length)
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$backupFile = Join-Path $BackupDir ("voltagetest-{0}.sql" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
& pg_dump $databaseUrl --file $backupFile
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }
Write-Host $backupFile
