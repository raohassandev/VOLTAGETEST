# UMS Architecture — v2.1.0

## System Overview

```
ESP32 Board (firmware v2.1.0)
        │  WiFi / MQTT 3.1.1
        ▼
  Mosquitto Broker  ← deployment/mosquitto/
        │  topic: ums/devices/+/data
        ▼
  mqtt-worker.ts (Node.js process)
        │  persists telemetry + alarms
        ▼
  PostgreSQL (via Prisma)
        │
        ▼
  Next.js App (web-dashboard/)
        │  HTTP API + SSE push
        ▼
  Browser Dashboard
```

---

## Components

### Firmware — `firmware/VOLTAGETEST/VOLTAGETEST.ino`

ESP32 Arduino firmware. Reads V/I/DC via ADC, publishes JSON to MQTT, serves HTTP API at `/api/info`, `/data`, `/calib`, `/update`.

### MQTT Worker — `web-dashboard/worker/mqtt-worker.ts`

Standalone Node.js process. Subscribes to `ums/devices/+/data`, parses payloads, calls `persistTelemetry()` and `runAlarmEvaluation()`. Marks devices offline after `OFFLINE_THRESHOLD_SECS`.

### Rollup — `web-dashboard/worker/rollup.ts`

Aggregates `TelemetryRaw` into `Telemetry1m` (1-minute buckets) and applies retention cleanup.

### Next.js App — `web-dashboard/src/`

- `app/` — page routes (App Router)
- `app/api/` — API routes
- `lib/` — shared server-side libraries (broker, scanner, worker, prisma)
- `components/` — shared UI components

### Embedded Broker — `web-dashboard/src/lib/broker.ts`

Optional Aedes MQTT broker for local dev (`ENABLE_EMBEDDED_BROKER=true`). Disabled in Docker (uses Mosquitto).

### LAN Scanner — `web-dashboard/src/lib/lan-scanner.ts`

Probes ARP table, hits `/api/info` on each candidate, registers discovered UMS boards.

---

## Data Models (Prisma)

| Table | Purpose |
|-------|---------|
| `Device` | Registered boards (deviceId, online, lastSeenAt, ip, firmware) |
| `TelemetryRaw` | Raw per-publish telemetry rows |
| `TelemetryLatest` | One row per device — latest values (upserted on each publish) |
| `Telemetry1m` | 1-minute rollup aggregates |
| `Alarm` | Active/cleared alarm records |
| `AlarmEvent` | Per-alarm state change events |
| `AlarmRule` | User-defined threshold rules |
| `UpsInventory` | Physical UPS register |
| `CalibrationProfile` | Per-device calibration coefficients |
| `SystemSettings` | Singleton row: offline threshold, retention periods |
| `DeviceDiscovered` | LAN scan results |
| `AuditLog` | Admin action log |

---

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/health` | GET | App health |
| `/api/system/health` | GET | System features status |
| `/api/system/stats` | GET | DB row counts |
| `/api/system/purge` | POST | Manual retention cleanup |
| `/api/devices` | GET/POST | Device list / register |
| `/api/devices/[id]/config` | POST | Config push (returns 501 in external-broker mode) |
| `/api/telemetry/latest` | GET | Latest telemetry per device |
| `/api/telemetry/history` | GET | Raw + rollup history |
| `/api/alarms` | GET | Alarm list |
| `/api/alarm-rules` | GET/POST/DELETE | Alarm rule CRUD |
| `/api/inventory` | GET/POST | UPS inventory |
| `/api/settings` | GET/PUT | System settings |
| `/api/users` | GET/POST | User management |
| `/api/discovered` | GET | LAN scan results |
| `/api/login` | POST | Form auth (x-www-form-urlencoded) |
| `/api/logout` | POST | Session clear |

---

## Environment Variables

See `deployment/.env.example` for all variables.

Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `MQTT_BROKER_URL` | `mqtt://localhost:1883` | Broker for mqtt-worker |
| `MQTT_TOPIC` | `ums/devices/+/data` | Topic filter |
| `ENABLE_EMBEDDED_BROKER` | `true` | `false` in Docker |
| `OFFLINE_THRESHOLD_SECS` | `60` | Seconds before device marked offline |
