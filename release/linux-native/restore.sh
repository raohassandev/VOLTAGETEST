#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup.sql.gz>"
  exit 1
fi

ENV_FILE="${ENV_FILE:-/etc/voltagetest/voltagetest.env}"
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a

echo "Restoring $BACKUP_FILE. Existing public schema will be replaced."
psql "$DATABASE_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"
echo "Restore completed."
