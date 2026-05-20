# Deployment Guide — UPS Monitoring System

## Prerequisites

- Docker 24+ and Docker Compose v2
- A Linux server (or WSL2 on Windows) with at least 1 GB RAM
- Mosquitto password file prepared (see COMMISSIONING_GUIDE.md)

---

## Quick Start (Docker Compose)

### 1. Copy and configure environment

```bash
cp web-dashboard/.env.example deployment/.env
```

Edit `deployment/.env` with real values:

```env
# Strong password for PostgreSQL
POSTGRES_PASSWORD=change-this-to-a-strong-password

# Admin credentials
UPS_AUTH_USERNAME=admin
UPS_AUTH_PASSWORD_HASH=<bcrypt hash — see below>
UPS_AUTH_TOKEN=<64-char hex — see below>

# MQTT
MQTT_USERNAME=dashboard
MQTT_PASSWORD=change-this-mqtt-password
```

**Generate bcrypt hash:**
```bash
node -e "const b=require('bcryptjs'); b.hash('YourPassword123',12).then(console.log)"
```

**Generate session token:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Set up Mosquitto credentials

```bash
cd deployment/mosquitto
# Create password file
docker run --rm eclipse-mosquitto:2 \
  mosquitto_passwd -c -b /tmp/passwords dashboard your-mqtt-password
# Copy the generated file
cp /tmp/passwords ./passwords

# Update acl file with the correct username if needed
```

### 3. Start the stack

```bash
cd deployment
docker compose --env-file .env up -d
```

Services started:
- `postgres` — PostgreSQL 16 on port 5432
- `mosquitto` — MQTT broker on port 1883
- `web` — Next.js dashboard on port 3000
- `mqtt-worker` — Background MQTT ingestion + alarm engine

### 4. Run database migrations

Migrations run automatically when the `web` container starts (`prisma migrate deploy`).

To run manually:
```bash
docker compose exec web npx prisma migrate deploy
```

### 5. Verify

```bash
# Dashboard health
curl http://localhost:3000/api/health

# Check logs
docker compose logs -f web
docker compose logs -f mqtt-worker
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes (production) | PostgreSQL connection string |
| `UPS_AUTH_TOKEN` | Yes | Long random hex string; value stored in session cookie |
| `UPS_AUTH_USERNAME` | No | Admin username (default: `admin`) |
| `UPS_AUTH_PASSWORD_HASH` | Recommended | Bcrypt hash of admin password |
| `UPS_AUTH_PASSWORD` | Dev only | Plain-text password (not for production) |
| `MQTT_BROKER_URL` | Yes (worker) | MQTT broker URL, e.g. `mqtt://localhost:1883` |
| `MQTT_USERNAME` | No | MQTT broker username |
| `MQTT_PASSWORD` | No | MQTT broker password |
| `MQTT_TOPIC` | No | MQTT topic filter (default: `building/+/ups/+/telemetry`) |
| `OFFLINE_THRESHOLD_SECS` | No | Seconds before a device is marked offline (default: `60`) |
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password (Docker Compose only) |

---

## Database Migrations

The project uses Prisma Migrate. To create a new migration after schema changes:

```bash
# Development
cd web-dashboard
DATABASE_URL=postgresql://ups_user:password@localhost:5432/upsmon \
  npx prisma migrate dev --name describe-change

# Production (apply pending migrations)
npx prisma migrate deploy
```

---

## Development Setup

```bash
cd web-dashboard
cp .env.example .env.local
# Edit .env.local with your local DB and MQTT broker

npm install
DATABASE_URL=postgresql://... npx prisma db push   # push schema without migrations
npm run dev                                         # start Next.js

# In a second terminal (optional — only if DB is configured):
npm run worker:dev
```

---

## Backup and Restore

```bash
# Backup
POSTGRES_PASSWORD=yourpassword deployment/scripts/backup.sh

# Restore (from a specific file)
POSTGRES_PASSWORD=yourpassword deployment/scripts/restore.sh deployment/backups/upsmon_20260520_120000.sql.gz
```

---

## Firmware Flashing

See `firmware/ups_monitor/README.md` for the Arduino IDE compile instructions.

**Compile command reference (Arduino CLI):**
```bash
arduino-cli compile \
  --fqbn esp32:esp32:esp32 \
  firmware/ups_monitor/ups_monitor.ino

arduino-cli upload \
  --fqbn esp32:esp32:esp32 \
  --port /dev/ttyUSB0 \
  firmware/ups_monitor/ups_monitor.ino
```
