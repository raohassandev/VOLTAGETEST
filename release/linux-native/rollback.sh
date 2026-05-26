#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${1:-}"
APP_DIR="${APP_DIR:-/opt/voltagetest}"
ENV_DIR="${ENV_DIR:-/etc/voltagetest}"
DATA_DIR="${DATA_DIR:-/var/lib/voltagetest}"
LOG_DIR="${LOG_DIR:-/var/log/voltagetest}"
LOG_FILE="$LOG_DIR/rollback.log"

mkdir -p "$LOG_DIR"
log() {
  printf '%s %s\n' "$(date -Iseconds)" "$*" | tee -a "$LOG_FILE"
}

if [ -z "$BACKUP_DIR" ] || [ ! -d "$BACKUP_DIR" ]; then
  echo "Usage: rollback.sh <backup-dir>" >&2
  exit 1
fi

log "Starting VOLTAGETEST Linux rollback from $BACKUP_DIR"
if [ "${VOLTAGETEST_CI_MODE:-0}" = "1" ]; then
  if [ -f "$DATA_DIR/voltagetest.pid" ]; then
    kill "$(cat "$DATA_DIR/voltagetest.pid")" 2>/dev/null || true
    rm -f "$DATA_DIR/voltagetest.pid"
  fi
else
  systemctl stop voltagetest.service 2>/dev/null || true
fi

if [ -d "$BACKUP_DIR/app" ]; then
  rm -rf "$APP_DIR"
  mkdir -p "$APP_DIR"
  rsync -a "$BACKUP_DIR/app/" "$APP_DIR/"
fi

if [ -f "$BACKUP_DIR/voltagetest.env" ]; then
  mkdir -p "$ENV_DIR"
  cp "$BACKUP_DIR/voltagetest.env" "$ENV_DIR/voltagetest.env"
fi

log "VOLTAGETEST Linux rollback completed. Customer data preserved at $DATA_DIR"
