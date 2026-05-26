#!/usr/bin/env bash
# Health check script for UPS Monitoring System
set -euo pipefail

DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:3000}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-upsmon}"
POSTGRES_USER="${POSTGRES_USER:-ups_user}"

echo "=== UPS Monitoring System Health Check ==="
echo "Timestamp: $(date)"
echo ""

# Dashboard
echo "[1] Dashboard health…"
HEALTH=$(curl -sf "${DASHBOARD_URL}/api/health" 2>&1) && \
  echo "    OK — $(echo "${HEALTH}" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(f"status={d[\"status\"]}, db={d.get(\"db\",\"disabled\")}")')" || \
  echo "    FAIL — dashboard not responding at ${DASHBOARD_URL}"

# PostgreSQL
echo "[2] PostgreSQL connectivity…"
PGPASSWORD="${POSTGRES_PASSWORD}" psql \
  -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" \
  -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  -c "SELECT COUNT(*) AS devices FROM \"Device\";" \
  -t --no-align 2>&1 | head -2 && echo "    OK" || echo "    FAIL — cannot connect to PostgreSQL"

# MQTT (port check only)
echo "[3] MQTT broker port…"
nc -z -w3 localhost 1883 2>/dev/null && echo "    OK — port 1883 open" || echo "    WARN — port 1883 not responding"

echo ""
echo "=== Done ==="
