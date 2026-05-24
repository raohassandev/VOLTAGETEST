#!/usr/bin/env bash
# UMS Production Docker Certification Script
# Run from the deployment/ directory after:
#   1. WSL2 is installed and Docker Desktop is running
#   2. deployment/.env exists with real secrets (see .env.example)
#   3. deployment/mosquitto/passwords exists (run setup-passwords.sh first)
#
# Usage:
#   cd deployment
#   bash certify.sh
#
set -euo pipefail

COMPOSE="docker compose"
COOKIES="/tmp/ums-cert-cookies.txt"
BASE_URL="http://localhost:3000"

# Admin password used for login smoke test.
# Must be set in the environment before running this script.
# Example: CERT_ADMIN_PASSWORD=YourActualPassword bash certify.sh
# Must match UPS_AUTH_PASSWORD in deployment/.env.
: "${CERT_ADMIN_PASSWORD:?Set CERT_ADMIN_PASSWORD to the current admin password before running certify.sh}"

pass() { echo "  ✅ $1"; }
fail() { echo "  ❌ FAIL: $1"; exit 1; }
step() { echo ""; echo "=== $1 ==="; }

# ── Step 1: Repo state ────────────────────────────────────────────────────────
step "1. Repo state"
git rev-parse --short HEAD
git log --oneline -3

# ── Step 2: Env and passwords check ──────────────────────────────────────────
step "2. Prerequisites"
[[ -f .env ]] || fail ".env missing — copy .env.example and fill secrets"
[[ -f mosquitto/passwords ]] || fail "mosquitto/passwords missing — run setup-passwords.sh first"
pass ".env present"
pass "mosquitto/passwords present"

# Verify .env is not committed
git ls-files .env | grep -q . && fail ".env is tracked by git — remove it!" || pass ".env not committed"

# ── Step 3: Tear down any previous stack ─────────────────────────────────────
step "3. Fresh stack"
$COMPOSE down -v --remove-orphans 2>&1 || true

# Validate compose file
$COMPOSE config -q && pass "compose config valid" || fail "docker compose config failed"

# Build and start
$COMPOSE up -d --build
pass "compose up completed"

# Wait for health
echo "Waiting for web container health..."
for i in $(seq 1 30); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$(${COMPOSE} ps -q web)" 2>/dev/null || echo "none")
  if [[ "$STATUS" == "healthy" ]]; then
    pass "web container healthy"
    break
  fi
  sleep 5
done
[[ "$STATUS" == "healthy" ]] || fail "web container did not become healthy in 150s (status: $STATUS)"

# ── Step 4: Container status ──────────────────────────────────────────────────
step "4. Container status"
$COMPOSE ps
for svc in postgres mosquitto web mqtt-worker; do
  STATE=$($COMPOSE ps --format json | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const rows=d.trim().split('\n').map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);const r=rows.find(x=>x.Service==='$svc');console.log(r?r.State:'missing');})")
  [[ "$STATE" == "running" ]] && pass "$svc running" || fail "$svc not running (state: $STATE)"
done

# ── Step 5: Fresh DB migrations ───────────────────────────────────────────────
step "5. DB migrations"
MIGRATIONS=$($COMPOSE exec -T postgres sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "select migration_name from \"_prisma_migrations\" order by finished_at;"')
echo "$MIGRATIONS"
echo "$MIGRATIONS" | grep -q "20260520000000_init" && pass "init migration present" || fail "init migration missing"
echo "$MIGRATIONS" | grep -q "20260523000001_v2_fields" && pass "v2_fields migration present" || fail "v2_fields migration missing"
echo "$MIGRATIONS" | grep -q "20260523120000_add_telemetry1m_energy_fields" && pass "energy_fields migration present" || fail "energy_fields migration missing"

TABLES=$($COMPOSE exec -T postgres sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "\dt"')
echo "$TABLES"
for tbl in TelemetryRaw TelemetryLatest Alarm AlarmEvent AuditLog UpsUnit Device; do
  echo "$TABLES" | grep -q "$tbl" && pass "table $tbl exists" || fail "table $tbl missing"
done

# ── Step 6: Public health endpoint ───────────────────────────────────────────
step "6. /api/health"
HEALTH=$(curl -sf "$BASE_URL/api/health")
echo "$HEALTH"
echo "$HEALTH" | grep -q '"status":"ok"' && pass "/api/health returns ok" || fail "/api/health unexpected body"
# Confirm it doesn't expose DB/MQTT internals
echo "$HEALTH" | grep -q '"db"' && fail "/api/health leaks db field" || pass "/api/health minimal (no db field)"

# ── Step 7: Auth flow ─────────────────────────────────────────────────────────
step "7. Auth"
UNAUTH=$(curl -si "$BASE_URL/" | head -1)
echo "/ unauth: $UNAUTH"
echo "$UNAUTH" | grep -q "307\|302" && pass "/ redirects unauthenticated" || fail "/ did not redirect"

WELCOME=$(curl -si "$BASE_URL/welcome" | head -1)
echo "$WELCOME" | grep -q "200" && pass "/welcome accessible" || fail "/welcome not 200"

# Login
rm -f "$COOKIES"
LOGIN=$(curl -si -c "$COOKIES" -X POST "$BASE_URL/api/login" \
  --data-urlencode "username=admin" \
  --data-urlencode "password=${CERT_ADMIN_PASSWORD}" \
  --data-urlencode "next=/")
echo "$LOGIN" | head -5
echo "$LOGIN" | grep -q "303\|302" && pass "login redirected" || fail "login did not redirect"
[[ -s "$COOKIES" ]] || fail "no cookies set after login"
pass "cookies saved"

# Authenticated /
DASH=$(curl -si -b "$COOKIES" "$BASE_URL/" | head -1)
echo "$DASH" | grep -q "200" && pass "/ with cookie returns 200" || fail "/ with cookie did not return 200"

# /api/system/health unauth
SYSHEALTH_UNAUTH=$(curl -s "$BASE_URL/api/system/health")
echo "$SYSHEALTH_UNAUTH"
echo "$SYSHEALTH_UNAUTH" | grep -q '"Unauthorized"' && pass "/api/system/health unauth=401" || fail "/api/system/health unauth did not return 401"

# /api/system/health with auth
SYSHEALTH=$(curl -s -b "$COOKIES" "$BASE_URL/api/system/health")
echo "$SYSHEALTH"
echo "$SYSHEALTH" | grep -q '"status":"ok"' && pass "/api/system/health auth=200" || fail "/api/system/health auth failed"
echo "$SYSHEALTH" | grep -q '"db":"connected"' && pass "db connected per system health" || fail "db not connected per system health"

# ── Step 8: External MQTT smoke test ─────────────────────────────────────────
step "8. External MQTT smoke"
# Check embedded broker is disabled
SYSHEALTH2=$(curl -s -b "$COOKIES" "$BASE_URL/api/system/health")
echo "$SYSHEALTH2" | grep -q '"embedded"' && fail "Embedded broker active — ENABLE_EMBEDDED_BROKER must be false" || pass "External broker mode confirmed"

MQTT_USER=$(grep MQTT_USERNAME .env | cut -d= -f2)
MQTT_PASS=$(grep MQTT_PASSWORD .env | cut -d= -f2)
TOPIC="ums/devices/DOCKER-SMOKE-001/data"
PAYLOAD='{"device_id":"DOCKER-SMOKE-001","volt_in":230,"volt_out":229,"volt_dc":13.4,"ct_in":2.3,"ct_out":1.8,"s_in_va":530,"s_out_va":420,"freq_in":50.0,"freq_out":50.0,"p_in_w":498,"p_out_w":400,"pf_in":0.94,"pf_out":0.95,"q_in_var":180,"q_out_var":140,"e_in_kwh":12.3,"e_out_kwh":11.8,"rssi":-65,"seq":1}'

# Need a device user in passwords — use dashboard user via ACL override or test user
# If DOCKER-SMOKE-001 user exists in passwords file, use it; else use dashboard via modified ACL
# The certify.sh expects a device user to exist. Use setup-passwords.sh to add DOCKER-SMOKE-001.
echo "Publishing MQTT payload as device user DOCKER-SMOKE-001..."
$COMPOSE exec -T mosquitto sh -c \
  "mosquitto_pub -h localhost -u 'DOCKER-SMOKE-001' -P '${MQTT_PASS}' -t '${TOPIC}' -m '${PAYLOAD}'" \
  || fail "mosquitto_pub failed — ensure DOCKER-SMOKE-001 user is in passwords file"
pass "MQTT message published"

sleep 3

# ── Step 9: Verify DB telemetry ───────────────────────────────────────────────
step "9. DB telemetry verification"
RAW=$($COMPOSE exec -T postgres sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "select \"deviceId\",\"voltIn\",\"freqIn\",\"freqOut\",\"pInW\",\"pOutW\",\"pfIn\",\"pfOut\",\"qInVar\",\"qOutVar\",\"eInKwh\",\"eOutKwh\" from \"TelemetryRaw\" where \"deviceId\"='"'"'DOCKER-SMOKE-001'"'"' order by \"receivedAt\" desc limit 1;"')
echo "TelemetryRaw: $RAW"
echo "$RAW" | grep -q "DOCKER-SMOKE-001" && pass "TelemetryRaw row inserted" || fail "TelemetryRaw not inserted — check worker logs"
echo "$RAW" | grep -q "50" && pass "freqIn stored correctly" || fail "freqIn missing — check worker field mapping"
echo "$RAW" | grep -q "180" && pass "qInVar stored correctly" || fail "qInVar missing"
echo "$RAW" | grep -q "498" && pass "pInW stored correctly" || fail "pInW missing"
echo "$RAW" | grep -q "12.3" && pass "eInKwh stored correctly" || fail "eInKwh missing"

LATEST=$($COMPOSE exec -T postgres sh -lc \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "select \"deviceId\",\"voltIn\",\"freqIn\" from \"TelemetryLatest\" where \"deviceId\"='"'"'DOCKER-SMOKE-001'"'"';"')
echo "TelemetryLatest: $LATEST"
echo "$LATEST" | grep -q "DOCKER-SMOKE-001" && pass "TelemetryLatest updated" || fail "TelemetryLatest not updated"

# ── Step 10: API telemetry and dashboard ──────────────────────────────────────
step "10. Dashboard/API"
TELEM=$(curl -s -b "$COOKIES" "$BASE_URL/api/telemetry/latest")
echo "$TELEM" | grep -q "DOCKER-SMOKE-001" && pass "/api/telemetry/latest shows smoke device" || fail "smoke device not in /api/telemetry/latest"

# Check no PUT /api/settings or /api/inventory in web logs
PUTS=$($COMPOSE logs --tail=300 web | grep -E "PUT /api/(settings|inventory)" || true)
[[ -z "$PUTS" ]] && pass "no PUT /api/settings or /api/inventory in web logs" || fail "auto-PUT detected in web logs: $PUTS"

# ── Step 11: Manual telemetry POST blocked ────────────────────────────────────
step "11. Security: POST /api/telemetry/latest"
BLOCKED=$(curl -si -b "$COOKIES" -X POST "$BASE_URL/api/telemetry/latest" \
  -H "Content-Type: application/json" -d '{"device_id":"manual-test","volt_in":230}' | head -1)
echo "$BLOCKED"
echo "$BLOCKED" | grep -q "403" && pass "manual telemetry POST returns 403" || fail "manual telemetry POST not blocked"

# ── Step 12: UPS PATCH audit ──────────────────────────────────────────────────
step "12. UPS PATCH audit"
# Get first UPS unit ID
UPS_ID=$(curl -s -b "$COOKIES" "$BASE_URL/api/ups" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.units?.[0]?.id||'none');})")
if [[ "$UPS_ID" == "none" ]]; then
  echo "  ⚠️  No UPS units in DB yet — skipping PATCH audit check"
else
  echo "Patching UPS $UPS_ID..."
  PATCH_RESP=$(curl -si -b "$COOKIES" -X PATCH "$BASE_URL/api/ups/$UPS_ID" \
    -H "Content-Type: application/json" -d '{"notes":"docker-cert-audit-test"}')
  echo "$PATCH_RESP" | head -3
  echo "$PATCH_RESP" | grep -q "200" && pass "PATCH returned 200" || fail "PATCH failed"

  AUDIT=$($COMPOSE exec -T postgres sh -lc \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "select action,entity,data from \"AuditLog\" where action='"'"'ups.update'"'"' order by \"createdAt\" desc limit 1;"')
  echo "AuditLog: $AUDIT"
  echo "$AUDIT" | grep -q "ups.update" && pass "AuditLog row created for ups.update" || fail "No AuditLog row for ups.update"
fi

# ── Step 13: Backup and restore ───────────────────────────────────────────────
step "13. Backup / restore"
BACKUP_FILE="/tmp/ums_docker_cert_$(date +%Y%m%d_%H%M%S).dump"
$COMPOSE exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP_FILE"
[[ -s "$BACKUP_FILE" ]] && pass "backup created: $BACKUP_FILE ($(wc -c < "$BACKUP_FILE") bytes)" || fail "backup empty"

# Create restore test DB — use separate exec calls; DROP DATABASE cannot run in a transaction block
$COMPOSE exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS ums_restore_test;"'
$COMPOSE exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE ums_restore_test;"'
cat "$BACKUP_FILE" | $COMPOSE exec -T postgres sh -lc 'pg_restore -U "$POSTGRES_USER" -d ums_restore_test -Fc'
pass "restore completed"

COUNTS=$($COMPOSE exec -T postgres sh -lc \
  'psql -U "$POSTGRES_USER" -d ums_restore_test -t -c "SELECT COUNT(*) FROM \"TelemetryRaw\";"')
echo "Restored TelemetryRaw count: $COUNTS"
echo "$COUNTS" | grep -qE "[1-9][0-9]*" && pass "restored DB has TelemetryRaw rows" || fail "restored DB TelemetryRaw empty"

# Cleanup
$COMPOSE exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS ums_restore_test;"'
pass "restore test DB dropped"

# ── Worker logs summary ───────────────────────────────────────────────────────
step "Worker and service logs"
echo "--- mqtt-worker (last 30 lines) ---"
$COMPOSE logs --tail=30 mqtt-worker
echo "--- mosquitto (last 10 lines) ---"
$COMPOSE logs --tail=10 mosquitto
echo "--- web 401/PUT errors ---"
$COMPOSE logs --tail=300 web | grep -E "401|500|PUT /api" | head -20 || echo "(none)"

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  ALL CERTIFICATION STEPS PASSED                                 ║"
echo "║  Runtime certification passed for this test environment.        ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
