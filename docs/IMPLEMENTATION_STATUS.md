# Implementation Status — UPS Monitoring System

> **📋 Historical document.** Status as of branch `professionalization-plan` (2026-05-21).
> Current release is **v2.1.0** on `energy-analyzer-integration`. See `docs/CLEANUP_AUDIT_REPORT.md` for current status.

**Branch:** `professionalization-plan`
**Last updated:** 2026-05-21

---

## Milestone 4A — In Progress (this milestone)

### A. Prisma Migrations

| Item | Status |
|------|--------|
| `prisma/migrations/` directory committed | ✅ Done |
| `prisma/migrations/20260520000000_init/migration.sql` | ✅ Generated via `prisma migrate diff --from-empty` |
| `prisma/migrations/migration_lock.toml` | ✅ Done |
| `prisma migrate deploy` creates all tables | ✅ Verified against empty DB |
| `prisma validate` passes | ✅ Verified |

**Production uses `prisma migrate deploy`, not `prisma db push`.** `db push` is for development exploration only and does not create migration history.

### B. Schema Accuracy

| Item | Status |
|------|--------|
| `Session` model removed from claims | ✅ Fixed — auth is env-token based, no DB sessions |
| `Telemetry1m` model added to schema | ✅ Done |
| All tables in schema match migration SQL | ✅ Verified |

**Auth is env-token only.** The `UPS_AUTH_TOKEN` env var is compared against the session cookie. There is no `Session` table. Multi-user DB auth is a future milestone.

### C. Telemetry 1m Rollup Table

| Item | Status |
|------|--------|
| `Telemetry1m` Prisma model | ✅ Added to schema + migration |
| Unique constraint `deviceId + bucketStart` | ✅ Done |
| Indexes: `(deviceId, bucketStart)`, `(bucketStart)` | ✅ Done |
| Fields: avg/min/max for volt_in/out/dc, avg/max for ct_in/out, sInVa/sOutVa, rssiAvg | ✅ Done |
| No kW / kWh / PF fields | ✅ Correct — not supported by firmware |

### D. Rollup Aggregation Job

| Item | Status |
|------|--------|
| `worker/rollup.ts` module | ✅ Done |
| `runRollup(prisma)` — aggregates closed minute buckets | ✅ Done |
| Looks back 2 hours, only complete minutes (`< NOW()`) | ✅ Done |
| Upsert-safe (no double counting) | ✅ Done |
| Per-bucket log: `[rollup] aggregated 2026-05-20T10:41:00Z — N device buckets` | ✅ Done |
| Scheduled every 60s in `mqtt-worker.ts` | ✅ Done |
| Individual bucket failure does not crash worker | ✅ try/catch per upsert |

### E. Retention Cleanup

| Item | Status |
|------|--------|
| `runRetentionCleanup(prisma)` in `worker/rollup.ts` | ✅ Done |
| Reads `rawRetentionDays`, `rollupRetentionMonths`, `alarmRetentionMonths` from DB | ✅ Done |
| Deletes `TelemetryRaw` older than `rawRetentionDays` | ✅ Done |
| Deletes `Telemetry1m` older than `rollupRetentionMonths` | ✅ Done |
| Deletes cleared/non-active alarms older than `alarmRetentionMonths` | ✅ Done |
| Runs at startup (after 10s delay) and every 24 hours | ✅ Done |
| Logs rows deleted per table | ✅ Done |

### F. History API

| Item | Status |
|------|--------|
| `GET /api/telemetry/history` updated | ✅ Done |
| ≤ 6 hours range → `TelemetryRaw`, `source: "raw"` | ✅ Done |
| > 6 hours range → `Telemetry1m`, `source: "1m"` | ✅ Done |
| `source` field in response | ✅ Done |
| Rollup response shape: `{ deviceId, bucketStart, sampleCount, voltIn: {avg,min,max}, ... }` | ✅ Done |

### G. Seed Script

| Item | Status |
|------|--------|
| `scripts/seed.ts` | ✅ Done |
| Creates default `SystemSettings` (always) | ✅ Done |
| Demo data only with `--demo` flag | ✅ Done |
| Blocked in production without `--force` | ✅ Done |
| `npm run db:seed` | ✅ Added to package.json |
| `npm run db:reset:local` | ✅ Added (dev only — migrate reset + seed --demo) |

---

## Milestone 2 + 3 — Completed

### Database Tables (Production Schema)

Tables present in schema and migration:
- `User` — future multi-user auth (no UI yet)
- `Site`, `UpsUnit`, `Device`, `CalibrationProfile`
- `AlarmRule`, `TelemetryRaw`, `TelemetryLatest`, `Telemetry1m`
- `Alarm`, `AlarmEvent`, `SystemSettings`, `AuditLog`

**Note:** There is no `Session` model. Auth uses env-token comparison only.

### B. DB-backed APIs

| Endpoint | Status |
|----------|--------|
| `GET/PUT/POST/DELETE /api/inventory` | ✅ DB-backed with JSON fallback |
| `GET/PUT /api/settings` | ✅ DB-backed with JSON fallback |
| `GET /api/telemetry/latest` | ✅ DB-backed with JSON fallback |
| `GET /api/telemetry/history` | ✅ DB-backed (raw ≤6h / rollup >6h) with JSON fallback |
| `GET /api/devices` | ✅ New |
| `GET /api/devices/:deviceId` | ✅ New |
| `GET /api/ups` | ✅ New |
| `GET/PATCH /api/ups/:id` | ✅ New |
| `GET /api/alarms` | ✅ New |
| `POST /api/alarms/:id/ack` | ✅ New |
| `GET /api/health` | ✅ New |

### C. MQTT Worker

| Item | Status |
|------|--------|
| Separate worker process | ✅ `web-dashboard/worker/mqtt-worker.ts` |
| MQTT subscribe + reconnect | ✅ Done |
| Telemetry persist to `telemetry_raw` | ✅ Done |
| Upsert `telemetry_latest` | ✅ Done |
| 1-minute rollup every 60s | ✅ Done (via `worker/rollup.ts`) |
| Retention cleanup every 24h | ✅ Done (via `worker/rollup.ts`) |
| Periodic offline check (every 30s) | ✅ Done |
| `npm run worker:start` / `worker:dev` | ✅ Scripts added |
| Separate Docker container (`mqtt-worker`) | ✅ `Dockerfile.worker` |

### D. Alarm Engine

| Item | Status |
|------|--------|
| Input voltage thresholds (low/high warn/crit) | ✅ Done |
| Output voltage thresholds | ✅ Done |
| Battery voltage thresholds (per nominal V) | ✅ Done |
| Input current high thresholds | ✅ Done |
| Output current high thresholds | ✅ Done |
| Output overload % (80% warn, 95% crit) | ✅ Done |
| Device offline alarm | ✅ Done |
| Debounce (configurable, default 30s) | ✅ In-memory debounce |
| Hysteresis on alarm clear (2%) | ✅ Done |
| Auto-clear when condition resolves | ✅ Done |
| Acknowledgment with comment | ✅ Via `POST /api/alarms/:id/ack` |

### E. Dashboard UI

| Page | Status |
|------|--------|
| `/login` | ✅ Unchanged |
| `/` fleet dashboard | ✅ Search, load%, offline indicator, nav links |
| `/ups/[id]` UPS detail | ✅ New — live telemetry, alarms, notes |
| `/alarms` alarm management | ✅ New — list, filter, ack with comment |
| `/admin/inventory` | ✅ New — full CRUD |
| `/admin/settings` | ✅ New — retention + offline threshold |

kW / kWh / PF shown as "not supported" — see `docs/MEASUREMENT_LIMITATIONS.md`.

### F. Auth

| Item | Status |
|------|--------|
| Bcrypt hash support (`UPS_AUTH_PASSWORD_HASH`) | ✅ Done |
| Plain-text fallback for development | ✅ Done |
| Production blocks login if no token/password set | ✅ Done |
| Hardcoded `admin12345` removed | ✅ Done |
| HTTP-only session cookie | ✅ Done |
| Edge-safe token comparison (no Node.js `crypto`) | ✅ Done |

### G. Deployment

| Item | Status |
|------|--------|
| `docker-compose.yml` with postgres, mosquitto, web, worker | ✅ Done |
| `Dockerfile.worker` for standalone worker | ✅ Done |
| `Dockerfile` with `prisma migrate deploy` on startup | ✅ Done |
| `.env.example` with all env vars documented | ✅ Done |
| `deployment/scripts/backup.sh` | ✅ Done |
| `deployment/scripts/restore.sh` | ✅ Done |
| `deployment/scripts/health-check.sh` | ✅ Done |

### H. Firmware v0.4.0

| Change | Status |
|--------|--------|
| `MQTT_PUBLISH_MS` default 500 → 5000 ms | ✅ Done |
| `seq` counter added to payload | ✅ Done |
| `free_heap` added to payload | ✅ Done |
| `mac` address added to payload | ✅ Done |
| `reset_reason` added to payload | ✅ Done |
| All existing payload keys unchanged (backward-compatible) | ✅ Verified |

### I. Firmware v0.5.0 — Commissioning Portal

| Change | Status |
|--------|--------|
| AP SSID changed to `UMS-SETUP-<last4MAC>` (was device-ID-based) | ✅ Done |
| AP password changed to `UMSSetup2026` (was `ChangeMe123`) | ✅ Done |
| `GET /` — status page with live data, network status badge, identity summary | ✅ Done |
| `GET /config` — full commissioning form (5 sections) | ✅ Done |
| `POST /save-config` — unified save handler, validation, NVS write | ✅ Done |
| `GET /reboot` — scheduled restart (2000ms delay) | ✅ Done |
| `GET /factory-reset` — clears all 4 NVS namespaces and reboots | ✅ Done |
| Password fields never expose saved values (always blank on form) | ✅ Done |
| Static IP fields show/hide via JavaScript radio toggle | ✅ Done |
| Validation: device_id + ups_id required; static IP fields required if mode=static | ✅ Done |
| WiFi AP fallback after `WIFI_CONNECT_TIMEOUT_MS` (30s); retry every 60s | ✅ Done |
| Configurable MQTT publish interval (`pub_int` NVS key, default 5s) | ✅ Done |
| Extended `DeviceSettings`: building, floor, section, workArea, location, installerNote | ✅ Done |
| New MQTT payload fields: `building`, `floor`, `section`, `work_area`, `location` | ✅ Done |
| New MQTT payload fields: `config_mode`, `wifi_mode`, `mqtt_connected` | ✅ Done |
| Legacy routes kept: `/save`, `/save-device`, `/save-mqtt`, `/save-calibration` | ✅ Done |
| PROGMEM CSS — shared stylesheet in flash, not DRAM | ✅ Done |

### J. Firmware v0.5.1 — AP Hardening + Compile Verification

| Change | Status |
|--------|--------|
| **Compile verified** — Arduino CLI 1.5.0, FQBN `esp32:esp32:esp32` (ESP32 Dev Module), core 3.3.8 | ✅ **0 errors** |
| Flash: 1,007,460 bytes (76%) / RAM: 47,760 bytes (14%) | ✅ Confirmed |
| `ADC_ATTEN_DB_11` deprecation warning eliminated → `ADC_ATTEN_DB_12` | ✅ Fixed |
| 2 remaining framework-level deprecation warnings (legacy ADC headers) — not errors, measurement algorithm unchanged | ℹ️ Expected |
| **AP hardening:** AP off by default when STA is connected | ✅ Done |
| `setup_ap_always` NVS key (`wifi` namespace, bool, default `false`) | ✅ Done |
| `startSetupAp()` / `stopSetupAp()` helpers — clean AP start/stop | ✅ Done |
| `connectWifi()` rewritten — AP only starts when needed (no SSID or `setupApAlways=true`) | ✅ Done |
| `reconnectWifiIfNeeded()` — stops AP on successful STA connect (unless `setupApAlways`) | ✅ Done |
| `/config` Security section — "Keep setup AP always enabled" checkbox (default unchecked) | ✅ Done |
| `handleSaveConfig()` — handles `setup_ap_always` checkbox | ✅ Done |
| `apActive` runtime state — tracks whether AP interface is actually running | ✅ Done |
| `wifi_mode` payload: `"STA"` / `"AP"` / `"AP+STA"` (corrected from v0.5.0) | ✅ Done |
| `setup_ap_enabled` payload field — true when AP interface running | ✅ Done |
| `config_mode` payload — true only in fallback/setup mode (not when `setupApAlways`) | ✅ Fixed |
| Status page (`/`) — shows correct badge for STA / AP fallback / AP+STA | ✅ Done |
| `factory-reset` clears `setup_ap_always` (via full `wifi` namespace wipe) | ✅ Done |
| CSS: `input[type=checkbox]` added to `width:auto` rule | ✅ Done |

**Routes registered and verified in `setupWebServer()`:**

| Route | Method | Handler | Status |
|-------|--------|---------|--------|
| `/` | GET | `handleRoot` | ✅ |
| `/config` | GET | `handleConfig` | ✅ |
| `/save-config` | POST | `handleSaveConfig` | ✅ |
| `/reboot` | GET | `handleReboot` | ✅ |
| `/factory-reset` | GET | `handleFactoryReset` | ✅ |
| `/data` | GET | `handleData` | ✅ |
| `/update` | GET | `handleUpdatePage` | ✅ |
| `/update` | POST | `handleUpdateFinished` + `handleUpdateUpload` | ✅ |
| `/save` | POST | `handleSave` (legacy) | ✅ |
| `/save-device` | POST | `handleSaveDevice` (legacy) | ✅ |
| `/save-mqtt` | POST | `handleSaveMqtt` (legacy) | ✅ |
| `/save-calibration` | POST | `handleSaveCalibration` (legacy) | ✅ |

### K. Firmware v0.5.2 — AP SSID First-Boot Fix + Hardware Verification

| Change | Status |
|--------|--------|
| **Bug fixed:** AP SSID was `UMS-SETUP-0000` on first boot — `WiFi.macAddress()` returns zeros before WiFi driver initialises | ✅ Fixed |
| `getMacLast4()` rewritten — uses `esp_read_mac(mac, ESP_MAC_WIFI_STA)` from `esp_mac.h` (eFuse, no WiFi init needed) | ✅ Done |
| `#include <esp_mac.h>` added to includes | ✅ Done |
| **Compile verified** — Arduino CLI 1.5.0, FQBN `esp32:esp32:esp32`, core 3.3.8, 0 errors | ✅ Done |
| Flash: 1,007,268 bytes (76%) / RAM: 47,760 bytes (14%) | ✅ Confirmed |
| **Hardware verified on COM11** (ESP32-D0WD-V3, MAC `30:76:F5:A5:AD:54`) | ✅ |
| USB flash via Arduino CLI — upload completed, hash verified | ✅ |
| Serial boot confirmed: `v0.5.2`, `AP SSID: UMS-SETUP-AD54`, measurements streaming | ✅ |
| All four portal routes accessible from AP: `/` `/config` `/data` `/update` | ✅ HTTP 200 |
| `/data` fields confirmed: firmware=0.5.2, mac, wifi_mode, config_mode, setup_ap_enabled | ✅ |
| AP fallback confirmed: STA fails → AP starts after 30 s with correct SSID `UMS-SETUP-AD54` | ✅ |
| Identity config saved via POST `/save-config` and persisted across reboot | ✅ |
| Static IP config saved (192.168.1.50) and loaded correctly after reboot — no crash | ✅ |
| **OTA verified end-to-end:** uploaded `0.5.1-OTA-TEST` binary, `/data` confirmed version change | ✅ |
| Official v0.5.2 restored via second OTA upload, `/data` confirmed `firmware: 0.5.2` | ✅ |
| **Factory reset confirmed:** NVS cleared, board reboots to `UPSMON-UNASSIGNED` first-boot state | ✅ |
| After factory reset, AP SSID is `UMS-SETUP-AD54` (fix confirmed on first boot) | ✅ |
| WiFi STA connectivity test: not fully verified (user WiFi password required) | ⚠️ Requires LAN access |

---

## Pending (Future Milestones)

- Multi-user DB auth with role-based access (User table exists, no UI/API yet)
- Per-device alarm rule overrides via AlarmRule table (engine uses hardcoded defaults today)
- Fleet OTA management from dashboard
- Active power (W), power factor, energy (kWh) — requires hardware metering IC (see MEASUREMENT_LIMITATIONS.md)
- Email/SMS/WhatsApp alarm notifications
- Production TLS / nginx reverse proxy
- Firmware Last Will / retained MQTT status topic
