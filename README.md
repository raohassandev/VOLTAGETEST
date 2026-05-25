# UPS Management System — v2.1.0

Professional UPS monitoring platform for ESP32-based UPS input, output, battery, current, and energy monitoring.

## Quick Start

```bash
cd deployment
cp .env.example .env          # fill in POSTGRES_PASSWORD, UPS_AUTH_TOKEN, MQTT_PASSWORD etc.
bash setup-passwords.sh       # creates Mosquitto password file
docker compose up -d --build  # start full stack
bash certify.sh               # smoke-test
```

Dashboard: `http://localhost:3000`

## Repository Structure

| Path | Purpose |
|------|---------|
| `firmware/VOLTAGETEST/` | **Canonical ESP32 firmware v2.1.0** |
| `web-dashboard/` | Next.js dashboard + API (PostgreSQL, Prisma) |
| `deployment/` | Docker Compose, Mosquitto ACL, certify.sh |
| `docs/` | Architecture, firmware guide, MQTT topics, limitations |
| `release/` | Release notes, operator guide, OTA binary |
| `archive/firmware/legacy-monitor/` | Archived legacy firmware notes — do not flash for v2.1.0 |

## Firmware

Canonical file: `firmware/VOLTAGETEST/VOLTAGETEST.ino`  
Version: **v2.1.0**  
MQTT topic: `ums/devices/<device_id>/data`  
Pre-built OTA binary: `release/firmware/v2.1.0/VOLTAGETEST-v2.1.0.merged.bin`

See `docs/FIRMWARE_GUIDE.md` for compile/flash instructions.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system overview
- [`docs/FIRMWARE_GUIDE.md`](docs/FIRMWARE_GUIDE.md) — firmware compile/flash/OTA
- [`docs/MQTT_TOPICS.md`](docs/MQTT_TOPICS.md) — topic scheme, payload format, auth
- [`docs/MEASUREMENT_LIMITATIONS.md`](docs/MEASUREMENT_LIMITATIONS.md) — accuracy and calibration
- [`docs/FIXING_GUIDELINES.md`](docs/FIXING_GUIDELINES.md) — rules for code changes
- [`docs/TESTING_AND_CERTIFICATION.md`](docs/TESTING_AND_CERTIFICATION.md) — test and certify

## Tests

```bash
cd web-dashboard
npm run dev          # start dev server (terminal 1)
npx playwright test  # run 74 e2e tests (terminal 2)
```
