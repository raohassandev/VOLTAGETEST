#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/voltagetest/voltagetest.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/lib/voltagetest/backups}"
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a
mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/voltagetest_$(date +%Y%m%d_%H%M%S).sql.gz"
pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip > "$FILE"
echo "$FILE"
