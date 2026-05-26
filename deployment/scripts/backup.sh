#!/usr/bin/env bash
# PostgreSQL backup script for UPS Monitoring System
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/upsmon_${TIMESTAMP}.sql.gz"

POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-upsmon}"
POSTGRES_USER="${POSTGRES_USER:-ups_user}"

mkdir -p "${BACKUP_DIR}"

echo "[backup] Backing up ${POSTGRES_DB} to ${BACKUP_FILE}"

PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h "${POSTGRES_HOST}" \
  -p "${POSTGRES_PORT}" \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --no-owner \
  --no-acl \
  | gzip > "${BACKUP_FILE}"

echo "[backup] Done: ${BACKUP_FILE} ($(du -h "${BACKUP_FILE}" | cut -f1))"

# Keep only the last 30 backups
find "${BACKUP_DIR}" -name "upsmon_*.sql.gz" -type f | sort -r | tail -n +31 | xargs -r rm -v
