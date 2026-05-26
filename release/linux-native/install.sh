#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/voltagetest}"
ENV_DIR="${ENV_DIR:-/etc/voltagetest}"
DATA_DIR="${DATA_DIR:-/var/lib/voltagetest}"
LOG_DIR="${LOG_DIR:-/var/log/voltagetest}"
ENV_FILE="${ENV_FILE:-${ENV_DIR}/voltagetest.env}"
SERVICE_FILE="/etc/systemd/system/voltagetest.service"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1"; exit 1; }
}

need_cmd node
need_cmd npm
need_cmd psql
need_cmd rsync
need_cmd curl
need_cmd systemctl

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node.js 22 or newer is required. Found: $(node --version)"
  exit 1
fi

mkdir -p "$APP_DIR" "$ENV_DIR" "$DATA_DIR/license" "$DATA_DIR/backups" "$LOG_DIR"
id voltagetest >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin voltagetest

rsync -a --delete --exclude node_modules --exclude .next --exclude .env ./web-dashboard/ "$APP_DIR/app/"
rsync -a ./release/linux-native/*.sh "$APP_DIR/scripts/"

if [ ! -f "$ENV_FILE" ]; then
  cp ./release/linux-native/voltagetest.env.example "$ENV_FILE"
  echo "Created $ENV_FILE. Edit it with real secrets and rerun install.sh."
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

node - <<'NODE'
const crypto = require('node:crypto');
const pem = (process.env.UMS_LICENSE_PUBLIC_KEY_PEM || '').replace(/\\n/g, '\n').trim();
if (!pem || pem.includes('REPLACE_WITH') || pem.includes('...')) throw new Error('UMS_LICENSE_PUBLIC_KEY_PEM is missing or placeholder text');
const key = crypto.createPublicKey(pem);
if (key.asymmetricKeyType !== 'ed25519') throw new Error('UMS_LICENSE_PUBLIC_KEY_PEM must be an Ed25519 public key');
NODE

cd "$APP_DIR/app"
npm ci
npm run db:generate
npm run build
npm run db:migrate
npm prune --omit=dev

cp "$OLDPWD/release/linux-native/voltagetest.service" "$SERVICE_FILE"
chown -R voltagetest:voltagetest "$APP_DIR" "$DATA_DIR" "$LOG_DIR"
systemctl daemon-reload
systemctl enable voltagetest.service
systemctl restart voltagetest.service
sleep 3
systemctl is-active --quiet voltagetest.service
curl -sf "http://localhost:${PORT:-3303}/api/health" >/dev/null
echo "Linux native install completed."
