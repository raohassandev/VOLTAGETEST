#!/usr/bin/env bash
# PostgreSQL restore script for UPS Monitoring System
set -euo pipefail

BACKUP_FILE="${1:-}"
if [ -z "${BACKUP_FILE}" ]; then
  echo "Usage: $0 <backup-file.sql.gz>"
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: backup file not found: ${BACKUP_FILE}"
  exit 1
fi

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-upsmon}"
POSTGRES_USER="${POSTGRES_USER:-ups_user}"

echo "[restore] Restoring ${BACKUP_FILE} to ${POSTGRES_DB}"
echo "[restore] WARNING: This will overwrite the current database. Press Ctrl+C within 5s to cancel."
sleep 5

PGPASSWORD="${POSTGRES_PASSWORD}" psql \
  -h "${POSTGRES_HOST}" \
  -p "${POSTGRES_PORT}" \
  -U "${POSTGRES_USER}" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" \
  "${POSTGRES_DB}"

gunzip -c "${BACKUP_FILE}" | PGPASSWORD="${POSTGRES_PASSWORD}" psql \
  -h "${POSTGRES_HOST}" \
  -p "${POSTGRES_PORT}" \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}"

echo "[restore] Done."
