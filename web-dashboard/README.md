# UPS Monitoring Dashboard — v2.1.0

Next.js dashboard for live UPS monitoring with ESP32 energy-analyzer boards.

## Quick Start

```bash
cd web-dashboard
cp .env.example .env          # then fill in values
npm install
npx prisma migrate deploy
npm run dev
```

Open `http://localhost:3303`.  Default login: `admin` / value from `UPS_AUTH_PASSWORD`.

## Environment Variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql://user:pass@localhost:5432/ums` | PostgreSQL connection |
| `UPS_AUTH_USERNAME` | `admin` | Admin login username |
| `UPS_AUTH_PASSWORD` | *(secret)* | Admin login password |
| `UPS_AUTH_TOKEN` | *(random 32+ chars)* | Session signing token |
| `MQTT_BROKER_URL` | `mqtt://localhost:1883` | Broker URL (embedded mode) |
| `MQTT_TOPIC` | `ums/devices/+/data` | v2.1.0 topic pattern |

## MQTT Topic

Firmware v2.1.0 publishes to:

```
ums/devices/{device_id}/data
```

Worker subscribes to:

```
ums/devices/+/data
```

## Build Checks

```bash
npm run lint
npm run build
npx playwright test
```

## Docker Deployment

```bash
cd ../deployment
docker compose up -d --build
CERT_ADMIN_PASSWORD=<admin-password> bash certify.sh
```

## Firmware

See `firmware/VOLTAGETEST/VOLTAGETEST.ino` — canonical v2.1.0 ESP32 sketch.
