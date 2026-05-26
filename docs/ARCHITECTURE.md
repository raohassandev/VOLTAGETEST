# UMS Architecture â€” v1.0.0

## System Overview

```
ESP32 Board (firmware v1.0.0)
        â”‚  WiFi / MQTT 3.1.1
        â–¼
  Mosquitto Broker  â† deployment/mosquitto/
        â”‚  topic: ums/devices/+/data
        â–¼
  mqtt-worker.ts (Node.js process)
        â”‚  persists telemetry + alarms
        â–¼
  PostgreSQL (via Prisma)
        â”‚
        â–¼
  Next.js App (web-dashboard/)
        â”‚  HTTP API + SSE push
        â–¼
  Browser Dashboard
```

---

## Components

### Firmware â€” `firmware/VOLTAGETEST/VOLTAGETEST.ino`

ESP32 Arduino firmware. Reads V/I/DC via ADC, publishes JSON to MQTT, serves HTTP API at `/api/info`, `/data`, `/calib`, `/update`.

### MQTT Worker â€” `web-dashboard/worker/mqtt-worker.ts`

Standalone Node.js process. Subscribes to `ums/devices/+/data`, parses payloads, calls `persistTelemetry()` and `runAlarmEvaluation()`. Marks devices offline after `OFFLINE_THRESHOLD_SECS`.

### Rollup â€” `web-dashboard/worker/rollup.ts`

Aggregates `TelemetryRaw` into `Telemetry1m` (1-minute buckets) and applies retention cleanup.

### Next.js App â€” `web-dashboard/src/`

- `app/` â€” page routes (App Router)
- `app/api/` â€” API routes
- `lib/` â€” shared server-side libraries (broker, scanner, worker, prisma)
- `components/` â€” shared UI components

### Embedded Broker â€” `web-dashboard/src/lib/broker.ts`

Optional Aedes MQTT broker for local dev (`ENABLE_EMBEDDED_BROKER=true`). Disabled in Docker (uses Mosquitto).

### LAN Scanner â€” `web-dashboard/src/lib/lan-scanner.ts`

Probes ARP table, hits `/api/info` on each candidate, registers discovered UMS boards.

---

## Data Models (Prisma)

| Table | Purpose |
|-------|---------|
| `Device` | Registered boards (deviceId, online, lastSeenAt, ip, firmware) |
| `TelemetryRaw` | Raw per-publish telemetry rows |
| `TelemetryLatest` | One row per device â€” latest values (upserted on each publish) |
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
| `DATABASE_URL` | â€” | PostgreSQL connection string |
| `MQTT_BROKER_URL` | `mqtt://localhost:1883` | Broker for mqtt-worker |
| `MQTT_TOPIC` | `ums/devices/+/data` | Topic filter |
| `ENABLE_EMBEDDED_BROKER` | `true` | `false` in Docker |
| `OFFLINE_THRESHOLD_SECS` | `60` | Seconds before device marked offline |
