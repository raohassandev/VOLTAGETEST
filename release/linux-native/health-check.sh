#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/voltagetest/voltagetest.env}"
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a

PORT="${PORT:-3303}"
curl -sf "http://localhost:${PORT}/api/health"
systemctl is-active --quiet voltagetest.service
psql "$DATABASE_URL" -c 'SELECT 1;' >/dev/null
echo "Linux native health check PASS"
