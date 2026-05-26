#!/usr/bin/env bash
set -euo pipefail

PURGE=false
if [ "${1:-}" = "--purge-data" ]; then
  PURGE=true
fi

APP_DIR="${APP_DIR:-/opt/voltagetest}"
ENV_DIR="${ENV_DIR:-/etc/voltagetest}"
DATA_DIR="${DATA_DIR:-/var/lib/voltagetest}"
LOG_DIR="${LOG_DIR:-/var/log/voltagetest}"

if [ "${VOLTAGETEST_CI_MODE:-0}" = "1" ]; then
  if [ -f "$DATA_DIR/voltagetest.pid" ]; then
    kill "$(cat "$DATA_DIR/voltagetest.pid")" 2>/dev/null || true
    rm -f "$DATA_DIR/voltagetest.pid"
  fi
else
  systemctl stop voltagetest.service 2>/dev/null || true
  systemctl disable voltagetest.service 2>/dev/null || true
  rm -f /etc/systemd/system/voltagetest.service
  systemctl daemon-reload
fi
rm -rf "$APP_DIR"

if [ "$PURGE" = true ]; then
  rm -rf "$ENV_DIR" "$DATA_DIR" "$LOG_DIR"
  userdel voltagetest 2>/dev/null || true
else
  echo "Preserved $ENV_DIR, $DATA_DIR, and $LOG_DIR."
fi

echo "Linux native uninstall completed."
