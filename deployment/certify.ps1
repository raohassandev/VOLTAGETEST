param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$ArchiveName = "VOLTAGETEST-v2.1.0-source-clean.zip"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")

function Pass($Message) { Write-Host "PASS: $Message" }
function Step($Message) { Write-Host ""; Write-Host "=== $Message ===" }
function Fail($Message) { throw "FAIL: $Message" }
function Compose([string[]]$ComposeArgs) {
  & docker compose @ComposeArgs
  if ($LASTEXITCODE -ne 0) { Fail "docker compose $($ComposeArgs -join ' ') failed" }
}
function Psql([string]$Sql, [string]$Db = "upsmon") {
  $Sql | docker compose exec -T postgres psql -U ups_user -d $Db -t
}

if (-not $env:CERT_ADMIN_PASSWORD) { Fail "Set CERT_ADMIN_PASSWORD before running certify.ps1" }
if (-not $env:UMS_LICENSE_PUBLIC_KEY_PEM) { Fail "Set UMS_LICENSE_PUBLIC_KEY_PEM before running certify.ps1" }

Set-Location $PSScriptRoot

Step "1. Repo state"
git -C $Root rev-parse HEAD
git -C $Root status --short
git -C $Root log --oneline -3

Step "2. Prerequisites"
if (-not (Test-Path ".env")) { Fail ".env missing" }
if (-not (Test-Path "mosquitto/passwords")) { Fail "mosquitto/passwords missing" }
if (git -C $Root ls-files deployment/.env) { Fail ".env is tracked" }
Pass ".env not committed"

Step "3. Docker compose"
Compose @("down", "-v", "--remove-orphans") | Out-Host
Compose @("config", "-q") | Out-Host
Pass "Docker compose config PASS"
Compose @("up", "-d", "--build") | Out-Host
Pass "Docker compose up/build PASS"

$webId = (Compose @("ps", "-q", "web")).Trim()
$webHealth = "unknown"
for ($i = 0; $i -lt 30; $i++) {
  $webHealth = (docker inspect --format='{{.State.Health.Status}}' $webId 2>$null)
  if ($webHealth -eq "healthy") { break }
  Start-Sleep -Seconds 5
}
if ($webHealth -ne "healthy") { Fail "web container not healthy: $webHealth" }
Pass "web container healthy"

Step "4. Service status"
Compose @("ps") | Out-Host
foreach ($svc in @("postgres", "mosquitto", "web", "mqtt-worker")) {
  $id = (Compose @("ps", "-q", $svc)).Trim()
  $running = docker inspect --format='{{.State.Running}}' $id
  if ($running -ne "true") { Fail "$svc not running" }
  Pass "$svc running"
}
$pgId = (Compose @("ps", "-q", "postgres")).Trim()
$pgHealth = docker inspect --format='{{.State.Health.Status}}' $pgId
if ($pgHealth -ne "healthy") { Fail "postgres not healthy: $pgHealth" }
Pass "postgres healthy"

Step "5. Prisma migrations and licensing tables"
$migrations = Psql 'select migration_name from "_prisma_migrations" order by finished_at;'
$migrations | Out-Host
foreach ($migration in @(
  "20260520000000_init",
  "20260523000001_v2_fields",
  "20260523120000_add_telemetry1m_energy_fields",
  "20260524000000_add_mqtt_broker",
  "20260525000000_add_licensing"
)) {
  if (($migrations -join "`n") -notmatch [regex]::Escape($migration)) { Fail "missing migration $migration" }
  Pass "migration applied: $migration"
}
$tables = Psql "select tablename from pg_tables where schemaname='public' order by tablename;"
$tables | Out-Host
foreach ($table in @("SystemLicense", "LicenseSeat", "TelemetryRaw", "TelemetryLatest", "AuditLog", "UpsUnit", "Device")) {
  if (($tables -join "`n") -notmatch [regex]::Escape($table)) { Fail "missing table $table" }
  Pass "table exists: $table"
}

Step "6. Health and auth"
$health = Invoke-RestMethod "$BaseUrl/api/health"
$health | ConvertTo-Json -Compress | Write-Host
if ($health.status -ne "ok") { Fail "/api/health not ok" }
Pass "health endpoint ok"
try {
  Invoke-WebRequest -UseBasicParsing "$BaseUrl/api/system/health" | Out-Null
  Fail "unauth system health expected 401"
} catch {
  if ($_.Exception.Response.StatusCode.value__ -ne 401) { Fail "unauth system health expected 401" }
}
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$login = Invoke-WebRequest -UseBasicParsing -WebSession $session -Method Post "$BaseUrl/api/login" -Body @{
  username = "admin"
  password = $env:CERT_ADMIN_PASSWORD
  next = "/"
} -MaximumRedirection 0 -ErrorAction SilentlyContinue
if ($login.StatusCode -notin @(302, 303)) { Fail "login did not redirect" }
$sysHealth = Invoke-RestMethod -WebSession $session "$BaseUrl/api/system/health"
$sysHealth | ConvertTo-Json -Compress | Write-Host
if ($sysHealth.db -ne "connected") { Fail "authenticated system health failed" }
Pass "auth flow PASS"

Step "7. Licensing API routes"
$licenseStatus = Invoke-RestMethod -WebSession $session "$BaseUrl/api/license/status"
if (-not $licenseStatus.machineCode) { Fail "license status route failed" }
$machine = Invoke-RestMethod -WebSession $session "$BaseUrl/api/license/machine-code"
if (-not $machine.machineCode) { Fail "license machine-code route failed" }
if (-not (Select-String -Path "$Root/web-dashboard/src/app/api/inventory/*" -Pattern "requireCanAddUps" -Quiet)) {
  Fail "UPS add enforcement path missing"
}
Pass "license APIs and UPS enforcement path present"

Step "8. MQTT telemetry smoke"
$mqttPassword = (Select-String -Path ".env" -Pattern "^MQTT_PASSWORD=(.*)$").Matches[0].Groups[1].Value
$payload = '{"device_id":"DOCKER-SMOKE-001","volt_in":230,"volt_out":229,"volt_dc":13.4,"ct_in":2.3,"ct_out":1.8,"s_in_va":530,"s_out_va":420,"freq_in":50.0,"freq_out":50.0,"p_in_w":498,"p_out_w":400,"pf_in":0.94,"pf_out":0.95,"q_in_var":180,"q_out_var":140,"e_in_kwh":12.3,"e_out_kwh":11.8,"rssi":-65,"seq":1}'
$payload | docker compose exec -T mosquitto sh -c "cat > /tmp/payload.json && mosquitto_pub -h localhost -u 'DOCKER-SMOKE-001' -P '$mqttPassword' -t 'ums/devices/DOCKER-SMOKE-001/data' -f /tmp/payload.json"
Start-Sleep -Seconds 4
$raw = Psql "select ""deviceId"",""voltIn"",""freqIn"",""pInW"",""qInVar"",""eInKwh"" from ""TelemetryRaw"" where ""deviceId""='DOCKER-SMOKE-001' order by ""receivedAt"" desc limit 1;"
$raw | Out-Host
if (($raw -join "`n") -notmatch "DOCKER-SMOKE-001") { Fail "DB telemetry verification failed" }
if (($raw -join "`n") -notmatch "498") { Fail "pInW missing" }
if (($raw -join "`n") -notmatch "180") { Fail "qInVar missing" }
Pass "MQTT telemetry smoke PASS"
Pass "DB telemetry verification PASS"

Step "9. Backup and restore"
$backup = Join-Path $env:TEMP ("ums_docker_cert_{0}.dump" -f (Get-Date -Format "yyyyMMdd_HHmmss"))
docker compose exec -T postgres pg_dump -U ups_user -d upsmon -Fc | Set-Content -Encoding Byte $backup
if ((Get-Item $backup).Length -le 0) { Fail "backup empty" }
docker compose exec -T postgres psql -U ups_user -d postgres -c 'DROP DATABASE IF EXISTS ums_restore_test;' | Out-Null
docker compose exec -T postgres psql -U ups_user -d postgres -c 'CREATE DATABASE ums_restore_test;' | Out-Null
Get-Content -Encoding Byte $backup | docker compose exec -T postgres pg_restore -U ups_user -d ums_restore_test -Fc
$restored = Psql 'SELECT COUNT(*) FROM "TelemetryRaw";' "ums_restore_test"
if (($restored -join "`n") -notmatch '[1-9][0-9]*') { Fail "restore verification failed" }
docker compose exec -T postgres psql -U ups_user -d postgres -c 'DROP DATABASE IF EXISTS ums_restore_test;' | Out-Null
Pass "backup/restore PASS"

Step "10. Clean source package"
git -C $Root archive --format=zip --output "$Root/$ArchiveName" HEAD
node "$Root/web-dashboard/scripts/clean-package-inspect.js" "$Root/$ArchiveName"
Pass "clean source package inspection PASS"

Write-Host ""
Write-Host "ALL CERTIFICATION STEPS PASSED"
