#!/usr/bin/env bash
set -euo pipefail

PURGE=false
if [ "${1:-}" = "--purge-data" ]; then
  PURGE=true
fi

systemctl stop voltagetest.service 2>/dev/null || true
systemctl disable voltagetest.service 2>/dev/null || true
rm -f /etc/systemd/system/voltagetest.service
systemctl daemon-reload
rm -rf /opt/voltagetest

if [ "$PURGE" = true ]; then
  rm -rf /etc/voltagetest /var/lib/voltagetest /var/log/voltagetest
  userdel voltagetest 2>/dev/null || true
else
  echo "Preserved /etc/voltagetest, /var/lib/voltagetest, and /var/log/voltagetest."
fi

echo "Linux native uninstall completed."
