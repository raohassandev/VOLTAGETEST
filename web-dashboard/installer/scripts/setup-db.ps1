#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Standalone DB init — creates PostgreSQL role + database, then runs migrations.
  Run this before the main installer if you need to create the DB user from scratch.

.EXAMPLE
  .\setup-db.ps1 -PgSuperPass "postgres" -DbPass "ums_password"
#>
param(
  [string]$PgHost      = "localhost",
  [string]$PgPort      = "5432",
  [string]$PgSuperUser = "postgres",
  [string]$PgSuperPass = "",
  [string]$DbName      = "ums_local",
  [string]$DbUser      = "ums_user",
  [string]$DbPass      = "ums_password",
  [string]$AppDir      = "."
)

$ErrorActionPreference = "Stop"

function PgExec($sql) {
  $env:PGPASSWORD = $PgSuperPass
  & psql -h $PgHost -p $PgPort -U $PgSuperUser -c $sql 2>&1
  $env:PGPASSWORD = ""
}

Write-Host "Creating role '$DbUser'..."
PgExec "DO `$`$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='$DbUser') THEN CREATE ROLE $DbUser LOGIN PASSWORD '$DbPass'; END IF; END `$`$;"

Write-Host "Creating database '$DbName'..."
$env:PGPASSWORD = $PgSuperPass
& psql -h $PgHost -p $PgPort -U $PgSuperUser -c "SELECT 1 FROM pg_database WHERE datname='$DbName'" | Out-Null
if ($LASTEXITCODE -eq 0) {
  & createdb -h $PgHost -p $PgPort -U $PgSuperUser -O $DbUser $DbName 2>&1 | Out-Null
}
$env:PGPASSWORD = ""

Write-Host "Granting privileges..."
PgExec "GRANT ALL PRIVILEGES ON DATABASE $DbName TO $DbUser;"
PgExec "ALTER DATABASE $DbName OWNER TO $DbUser;"

Write-Host "Running Prisma migrations..."
$env:DATABASE_URL = "postgresql://${DbUser}:${DbPass}@${PgHost}:${PgPort}/${DbName}"
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if ($NodeExe) {
  & $NodeExe "$AppDir\node_modules\.bin\prisma" db push --accept-data-loss
  Write-Host "Done. Connection string:"
  Write-Host "  DATABASE_URL=$env:DATABASE_URL"
} else {
  Write-Host "Node.js not found — run 'prisma db push' manually after installing Node."
}
$env:DATABASE_URL = ""
