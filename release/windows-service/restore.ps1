param(
  [Parameter(Mandatory = $true)][string]$BackupFile,
  [string]$EnvFile = "$env:ProgramData\VOLTAGETEST\voltagetest.env"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  throw "Missing required command: psql"
}
if (-not (Test-Path $BackupFile)) {
  throw "Missing backup file: $BackupFile"
}

$databaseUrl = (Get-Content $EnvFile | Where-Object { $_ -like "DATABASE_URL=*" } | Select-Object -First 1).Substring("DATABASE_URL=".Length)
& psql $databaseUrl --file $BackupFile
if ($LASTEXITCODE -ne 0) { throw "psql restore failed" }
Write-Host "VOLTAGETEST restore PASS"
