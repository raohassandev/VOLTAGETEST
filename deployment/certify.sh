#!/usr/bin/env bash
set -euo pipefail

COMPOSE="docker compose"
BASE_URL="${BASE_URL:-http://localhost:3000}"
COOKIES="/tmp/ums-cert-cookies.txt"
ARCHIVE_NAME="VOLTAGETEST-v1.0.0-source-clean.zip"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

: "${CERT_ADMIN_PASSWORD:?Set CERT_ADMIN_PASSWORD to the current admin password before running certify.sh}"
: "${UMS_LICENSE_PUBLIC_KEY_PEM:?Set UMS_LICENSE_PUBLIC_KEY_PEM before running certify.sh}"

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }
step() { echo ""; echo "=== $1 ==="; }
psql_ums() { $COMPOSE exec -T postgres psql -U ups_user -d "${2:-upsmon}" -t <<< "$1"; }

step "1. Repo state"
git -C "$ROOT_DIR" rev-parse HEAD
git -C "$ROOT_DIR" status --short
git -C "$ROOT_DIR" log --oneline -3

step "2. Prerequisites"
[[ -f .env ]] || fail ".env missing"
[[ -f mosquitto/passwords ]] || fail "mosquitto/passwords missing"
git -C "$ROOT_DIR" ls-files deployment/.env | grep -q . && fail ".env is tracked" || pass ".env not committed"

step "3. Docker compose"
$COMPOSE down -v --remove-orphans || true
$COMPOSE config -q && pass "Docker compose config PASS"
$COMPOSE up -d --build && pass "Docker compose up/build PASS"

echo "Waiting for web container health..."
STATUS="unknown"
for _ in $(seq 1 30); do
  STATUS="$(docker inspect --format='{{.State.Health.Status}}' "$($COMPOSE ps -q web)" 2>/dev/null || echo unknown)"
  [[ "$STATUS" == "healthy" ]] && break
  sleep 5
done
[[ "$STATUS" == "healthy" ]] || fail "web container not healthy: $STATUS"
pass "web container healthy"

step "4. Service status"
$COMPOSE ps
for svc in postgres mosquitto web mqtt-worker; do
  running="$(docker inspect --format='{{.State.Running}}' "$($COMPOSE ps -q "$svc")")"
  [[ "$running" == "true" ]] || fail "$svc not running"
  pass "$svc running"
done
pg_health="$(docker inspect --format='{{.State.Health.Status}}' "$($COMPOSE ps -q postgres)")"
[[ "$pg_health" == "healthy" ]] || fail "postgres not healthy: $pg_health"
pass "postgres healthy"

step "5. Prisma migrations and licensing tables"
MIGRATIONS="$(psql_ums 'select migration_name from "_prisma_migrations" order by finished_at;')"
echo "$MIGRATIONS"
for migration in \
  20260520000000_init \
  20260523000001_v2_fields \
  20260523120000_add_telemetry1m_energy_fields \
  20260524000000_add_mqtt_broker \
  20260525000000_add_licensing; do
  echo "$MIGRATIONS" | grep -q "$migration" || fail "missing migration $migration"
  pass "migration applied: $migration"
done
TABLES="$(psql_ums "select tablename from pg_tables where schemaname='public' order by tablename;")"
echo "$TABLES"
for table in SystemLicense LicenseSeat TelemetryRaw TelemetryLatest AuditLog UpsUnit Device; do
  echo "$TABLES" | grep -q "$table" || fail "missing table $table"
  pass "table exists: $table"
done

step "6. Health and auth"
HEALTH="$(curl -sf "$BASE_URL/api/health")"
echo "$HEALTH"
echo "$HEALTH" | grep -q '"status":"ok"' || fail "/api/health not ok"
pass "health endpoint ok"
unauth_code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/system/health")"
[[ "$unauth_code" == "401" ]] || fail "unauth system health expected 401, got $unauth_code"
rm -f "$COOKIES"
LOGIN="$(curl -si -c "$COOKIES" -X POST "$BASE_URL/api/login" \
  --data-urlencode "username=admin" \
  --data-urlencode "password=${CERT_ADMIN_PASSWORD}" \
  --data-urlencode "next=/")"
echo "$LOGIN" | head -5
echo "$LOGIN" | grep -Eq "303|302" || fail "login did not redirect"
SYSHEALTH="$(curl -s -b "$COOKIES" "$BASE_URL/api/system/health")"
echo "$SYSHEALTH"
echo "$SYSHEALTH" | grep -q '"db":"connected"' || fail "authenticated system health failed"
pass "auth flow PASS"

step "7. Licensing API routes"
curl -sf -b "$COOKIES" "$BASE_URL/api/license/status" | grep -q '"machineCode"' || fail "license status route failed"
curl -sf -b "$COOKIES" "$BASE_URL/api/license/machine-code" | grep -q '"machineCode"' || fail "license machine-code route failed"
grep -R "requireCanAddUps" "$ROOT_DIR/web-dashboard/src/app/api/inventory" >/dev/null || fail "UPS add enforcement path missing"
pass "license APIs and UPS enforcement path present"

step "8. MQTT telemetry smoke"
MQTT_PASS="$(grep '^MQTT_PASSWORD=' .env | cut -d= -f2-)"
PAYLOAD='{"device_id":"DOCKER-SMOKE-001","volt_in":230,"volt_out":229,"volt_dc":13.4,"ct_in":2.3,"ct_out":1.8,"s_in_va":530,"s_out_va":420,"freq_in":50.0,"freq_out":50.0,"p_in_w":498,"p_out_w":400,"pf_in":0.94,"pf_out":0.95,"q_in_var":180,"q_out_var":140,"e_in_kwh":12.3,"e_out_kwh":11.8,"rssi":-65,"seq":1}'
printf '%s' "$PAYLOAD" | $COMPOSE exec -T mosquitto sh -c "cat > /tmp/payload.json && mosquitto_pub -h localhost -u 'DOCKER-SMOKE-001' -P '$MQTT_PASS' -t 'ums/devices/DOCKER-SMOKE-001/data' -f /tmp/payload.json"
sleep 4
RAW="$(psql_ums "select \"deviceId\",\"voltIn\",\"freqIn\",\"pInW\",\"qInVar\",\"eInKwh\" from \"TelemetryRaw\" where \"deviceId\"='DOCKER-SMOKE-001' order by \"receivedAt\" desc limit 1;")"
echo "$RAW"
echo "$RAW" | grep -q "DOCKER-SMOKE-001" || fail "DB telemetry verification failed"
echo "$RAW" | grep -q "498" || fail "pInW missing"
echo "$RAW" | grep -q "180" || fail "qInVar missing"
pass "MQTT telemetry smoke PASS"
pass "DB telemetry verification PASS"

step "9. Backup and restore"
BACKUP_FILE="/tmp/ums_docker_cert_$(date +%Y%m%d_%H%M%S).dump"
$COMPOSE exec -T postgres pg_dump -U ups_user -d upsmon -Fc > "$BACKUP_FILE"
[[ -s "$BACKUP_FILE" ]] || fail "backup empty"
$COMPOSE exec -T postgres psql -U ups_user -d postgres -c 'DROP DATABASE IF EXISTS ums_restore_test;' >/dev/null
$COMPOSE exec -T postgres psql -U ups_user -d postgres -c 'CREATE DATABASE ums_restore_test;' >/dev/null
cat "$BACKUP_FILE" | $COMPOSE exec -T postgres pg_restore -U ups_user -d ums_restore_test -Fc
RESTORED="$(psql_ums 'SELECT COUNT(*) FROM "TelemetryRaw";' ums_restore_test)"
echo "$RESTORED" | grep -Eq '[1-9][0-9]*' || fail "restore verification failed"
$COMPOSE exec -T postgres psql -U ups_user -d postgres -c 'DROP DATABASE IF EXISTS ums_restore_test;' >/dev/null
pass "backup/restore PASS"

step "10. Clean source package"
git -C "$ROOT_DIR" archive --format=zip --output "$ROOT_DIR/$ARCHIVE_NAME" HEAD
node "$ROOT_DIR/web-dashboard/scripts/clean-package-inspect.js" "$ROOT_DIR/$ARCHIVE_NAME"
pass "clean source package inspection PASS"

echo ""
echo "ALL CERTIFICATION STEPS PASSED"
