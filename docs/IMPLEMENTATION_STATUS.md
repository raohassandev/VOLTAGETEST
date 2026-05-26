# Implementation Status â€” UPS Monitoring System

> **ðŸ“‹ Historical document.** Status as of branch `professionalization-plan` (2026-05-21).
> Current release is **v1.0.0** on `energy-analyzer-integration`. See `docs/CLEANUP_AUDIT_REPORT.md` for current status.

**Branch:** `professionalization-plan`
**Last updated:** 2026-05-21

---

## Milestone 4A â€” In Progress (this milestone)

### A. Prisma Migrations

| Item | Status |
|------|--------|
| `prisma/migrations/` directory committed | âœ… Done |
| `prisma/migrations/20260520000000_init/migration.sql` | âœ… Generated via `prisma migrate diff --from-empty` |
| `prisma/migrations/migration_lock.toml` | âœ… Done |
| `prisma migrate deploy` creates all tables | âœ… Verified against empty DB |
| `prisma validate` passes | âœ… Verified |

**Production uses `prisma migrate deploy`, not `prisma db push`.** `db push` is for development exploration only and does not create migration history.

### B. Schema Accuracy

| Item | Status |
|------|--------|
| `Session` model removed from claims | âœ… Fixed â€” auth is env-token based, no DB sessions |
| `Telemetry1m` model added to schema | âœ… Done |
| All tables in schema match migration SQL | âœ… Verified |

**Auth is env-token only.** The `UPS_AUTH_TOKEN` env var is compared against the session cookie. There is no `Session` table. Multi-user DB auth is a future milestone.

### C. Telemetry 1m Rollup Table

| Item | Status |
|------|--------|
| `Telemetry1m` Prisma model | âœ… Added to schema + migration |
| Unique constraint `deviceId + bucketStart` | âœ… Done |
| Indexes: `(deviceId, bucketStart)`, `(bucketStart)` | âœ… Done |
| Fields: avg/min/max for volt_in/out/dc, avg/max for ct_in/out, sInVa/sOutVa, rssiAvg | âœ… Done |
| kW / kWh / PF / Q / Hz energy fields | âœ… Implemented in v1.0.0 firmware and backend |

### D. Rollup Aggregation Job

| Item | Status |
|------|--------|
| `worker/rollup.ts` module | âœ… Done |
| `runRollup(prisma)` â€” aggregates closed minute buckets | âœ… Done |
| Looks back 2 hours, only complete minutes (`< NOW()`) | âœ… Done |
| Upsert-safe (no double counting) | âœ… Done |
| Per-bucket log: `[rollup] aggregated 2026-05-20T10:41:00Z â€” N device buckets` | âœ… Done |
| Scheduled every 60s in `mqtt-worker.ts` | âœ… Done |
| Individual bucket failure does not crash worker | âœ… try/catch per upsert |

### E. Retention Cleanup

| Item | Status |
|------|--------|
| `runRetentionCleanup(prisma)` in `worker/rollup.ts` | âœ… Done |
| Reads `rawRetentionDays`, `rollupRetentionMonths`, `alarmRetentionMonths` from DB | âœ… Done |
| Deletes `TelemetryRaw` older than `rawRetentionDays` | âœ… Done |
| Deletes `Telemetry1m` older than `rollupRetentionMonths` | âœ… Done |
| Deletes cleared/non-active alarms older than `alarmRetentionMonths` | âœ… Done |
| Runs at startup (after 10s delay) and every 24 hours | âœ… Done |
| Logs rows deleted per table | âœ… Done |

### F. History API

| Item | Status |
|------|--------|
| `GET /api/telemetry/history` updated | âœ… Done |
| â‰¤ 6 hours range â†’ `TelemetryRaw`, `source: "raw"` | âœ… Done |
| > 6 hours range â†’ `Telemetry1m`, `source: "1m"` | âœ… Done |
| `source` field in response | âœ… Done |
| Rollup response shape: `{ deviceId, bucketStart, sampleCount, voltIn: {avg,min,max}, ... }` | âœ… Done |

### G. Seed Script

| Item | Status |
|------|--------|
| `scripts/seed.ts` | âœ… Done |
| Creates default `SystemSettings` (always) | âœ… Done |
| Demo data only with `--demo` flag | âœ… Done |
| Blocked in production without `--force` | âœ… Done |
| `npm run db:seed` | âœ… Added to package.json |
| `npm run db:reset:local` | âœ… Added (dev only â€” migrate reset + seed --demo) |

---

## Milestone 2 + 3 â€” Completed

### Database Tables (Production Schema)

Tables present in schema and migration:
- `User` â€” future multi-user auth (no UI yet)
- `Site`, `UpsUnit`, `Device`, `CalibrationProfile`
- `AlarmRule`, `TelemetryRaw`, `TelemetryLatest`, `Telemetry1m`
- `Alarm`, `AlarmEvent`, `SystemSettings`, `AuditLog`

**Note:** There is no `Session` model. Auth uses env-token comparison only.

### B. DB-backed APIs

| Endpoint | Status |
|----------|--------|
| `GET/PUT/POST/DELETE /api/inventory` | âœ… DB-backed with JSON fallback |
| `GET/PUT /api/settings` | âœ… DB-backed with JSON fallback |
| `GET /api/telemetry/latest` | âœ… DB-backed with JSON fallback |
| `GET /api/telemetry/history` | âœ… DB-backed (raw â‰¤6h / rollup >6h) with JSON fallback |
| `GET /api/devices` | âœ… New |
| `GET /api/devices/:deviceId` | âœ… New |
| `GET /api/ups` | âœ… New |
| `GET/PATCH /api/ups/:id` | âœ… New |
| `GET /api/alarms` | âœ… New |
| `POST /api/alarms/:id/ack` | âœ… New |
| `GET /api/health` | âœ… New |

### C. MQTT Worker

| Item | Status |
|------|--------|
| Separate worker process | âœ… `web-dashboard/worker/mqtt-worker.ts` |
| MQTT subscribe + reconnect | âœ… Done |
| Telemetry persist to `telemetry_raw` | âœ… Done |
| Upsert `telemetry_latest` | âœ… Done |
| 1-minute rollup every 60s | âœ… Done (via `worker/rollup.ts`) |
| Retention cleanup every 24h | âœ… Done (via `worker/rollup.ts`) |
| Periodic offline check (every 30s) | âœ… Done |
| `npm run worker:start` / `worker:dev` | âœ… Scripts added |
| Separate Docker container (`mqtt-worker`) | âœ… `Dockerfile.worker` |

### D. Alarm Engine

| Item | Status |
|------|--------|
| Input voltage thresholds (low/high warn/crit) | âœ… Done |
| Output voltage thresholds | âœ… Done |
| Battery voltage thresholds (per nominal V) | âœ… Done |
| Input current high thresholds | âœ… Done |
| Output current high thresholds | âœ… Done |
| Output overload % (80% warn, 95% crit) | âœ… Done |
| Device offline alarm | âœ… Done |
| Debounce (configurable, default 30s) | âœ… In-memory debounce |
| Hysteresis on alarm clear (2%) | âœ… Done |
| Auto-clear when condition resolves | âœ… Done |
| Acknowledgment with comment | âœ… Via `POST /api/alarms/:id/ack` |

### E. Dashboard UI

| Page | Status |
|------|--------|
| `/login` | âœ… Unchanged |
| `/` fleet dashboard | âœ… Search, load%, offline indicator, nav links |
| `/ups/[id]` UPS detail | âœ… New â€” live telemetry, alarms, notes |
| `/alarms` alarm management | âœ… New â€” list, filter, ack with comment |
| `/admin/inventory` | âœ… New â€” full CRUD |
| `/admin/settings` | âœ… New â€” retention + offline threshold |

kW / kWh / PF / Q / Hz implemented in v1.0.0. Accuracy requires reference-meter calibration. See `docs/MEASUREMENT_LIMITATIONS.md`.

### F. Auth

| Item | Status |
|------|--------|
| Bcrypt hash support (`UPS_AUTH_PASSWORD_HASH`) | âœ… Done |
| Plain-text fallback for development | âœ… Done |
| Production blocks login if no token/password set | âœ… Done |
| Hardcoded `admin12345` removed | âœ… Done |
| HTTP-only session cookie | âœ… Done |
| Edge-safe token comparison (no Node.js `crypto`) | âœ… Done |

### G. Deployment

| Item | Status |
|------|--------|
| `docker-compose.yml` with postgres, mosquitto, web, worker | âœ… Done |
| `Dockerfile.worker` for standalone worker | âœ… Done |
| `Dockerfile` with `prisma migrate deploy` on startup | âœ… Done |
| `.env.example` with all env vars documented | âœ… Done |
| `deployment/scripts/backup.sh` | âœ… Done |
| `deployment/scripts/restore.sh` | âœ… Done |
| `deployment/scripts/health-check.sh` | âœ… Done |

### H. Firmware v0.4.0

| Change | Status |
|--------|--------|
| `MQTT_PUBLISH_MS` default 500 â†’ 5000 ms | âœ… Done |
| `seq` counter added to payload | âœ… Done |
| `free_heap` added to payload | âœ… Done |
| `mac` address added to payload | âœ… Done |
| `reset_reason` added to payload | âœ… Done |
| All existing payload keys unchanged (backward-compatible) | âœ… Verified |

### I. Firmware v0.5.0 â€” Commissioning Portal

| Change | Status |
|--------|--------|
| AP SSID changed to `UMS-SETUP-<last4MAC>` (was device-ID-based) | âœ… Done |
| AP password changed to `UMSSetup2026` (was `ChangeMe123`) | âœ… Done |
| `GET /` â€” status page with live data, network status badge, identity summary | âœ… Done |
| `GET /config` â€” full commissioning form (5 sections) | âœ… Done |
| `POST /save-config` â€” unified save handler, validation, NVS write | âœ… Done |
| `GET /reboot` â€” scheduled restart (2000ms delay) | âœ… Done |
| `GET /factory-reset` â€” clears all 4 NVS namespaces and reboots | âœ… Done |
| Password fields never expose saved values (always blank on form) | âœ… Done |
| Static IP fields show/hide via JavaScript radio toggle | âœ… Done |
| Validation: device_id + ups_id required; static IP fields required if mode=static | âœ… Done |
| WiFi AP fallback after `WIFI_CONNECT_TIMEOUT_MS` (30s); retry every 60s | âœ… Done |
| Configurable MQTT publish interval (`pub_int` NVS key, default 5s) | âœ… Done |
| Extended `DeviceSettings`: building, floor, section, workArea, location, installerNote | âœ… Done |
| New MQTT payload fields: `building`, `floor`, `section`, `work_area`, `location` | âœ… Done |
| New MQTT payload fields: `config_mode`, `wifi_mode`, `mqtt_connected` | âœ… Done |
| Legacy routes kept: `/save`, `/save-device`, `/save-mqtt`, `/save-calibration` | âœ… Done |
| PROGMEM CSS â€” shared stylesheet in flash, not DRAM | âœ… Done |

### J. Firmware v0.5.1 â€” AP Hardening + Compile Verification

| Change | Status |
|--------|--------|
| **Compile verified** â€” Arduino CLI 1.5.0, FQBN `esp32:esp32:esp32` (ESP32 Dev Module), core 3.3.8 | âœ… **0 errors** |
| Flash: 1,007,460 bytes (76%) / RAM: 47,760 bytes (14%) | âœ… Confirmed |
| `ADC_ATTEN_DB_11` deprecation warning eliminated â†’ `ADC_ATTEN_DB_12` | âœ… Fixed |
| 2 remaining framework-level deprecation warnings (legacy ADC headers) â€” not errors, measurement algorithm unchanged | â„¹ï¸ Expected |
| **AP hardening:** AP off by default when STA is connected | âœ… Done |
| `setup_ap_always` NVS key (`wifi` namespace, bool, default `false`) | âœ… Done |
| `startSetupAp()` / `stopSetupAp()` helpers â€” clean AP start/stop | âœ… Done |
| `connectWifi()` rewritten â€” AP only starts when needed (no SSID or `setupApAlways=true`) | âœ… Done |
| `reconnectWifiIfNeeded()` â€” stops AP on successful STA connect (unless `setupApAlways`) | âœ… Done |
| `/config` Security section â€” "Keep setup AP always enabled" checkbox (default unchecked) | âœ… Done |
| `handleSaveConfig()` â€” handles `setup_ap_always` checkbox | âœ… Done |
| `apActive` runtime state â€” tracks whether AP interface is actually running | âœ… Done |
| `wifi_mode` payload: `"STA"` / `"AP"` / `"AP+STA"` (corrected from v0.5.0) | âœ… Done |
| `setup_ap_enabled` payload field â€” true when AP interface running | âœ… Done |
| `config_mode` payload â€” true only in fallback/setup mode (not when `setupApAlways`) | âœ… Fixed |
| Status page (`/`) â€” shows correct badge for STA / AP fallback / AP+STA | âœ… Done |
| `factory-reset` clears `setup_ap_always` (via full `wifi` namespace wipe) | âœ… Done |
| CSS: `input[type=checkbox]` added to `width:auto` rule | âœ… Done |

**Routes registered and verified in `setupWebServer()`:**

| Route | Method | Handler | Status |
|-------|--------|---------|--------|
| `/` | GET | `handleRoot` | âœ… |
| `/config` | GET | `handleConfig` | âœ… |
| `/save-config` | POST | `handleSaveConfig` | âœ… |
| `/reboot` | GET | `handleReboot` | âœ… |
| `/factory-reset` | GET | `handleFactoryReset` | âœ… |
| `/data` | GET | `handleData` | âœ… |
| `/update` | GET | `handleUpdatePage` | âœ… |
| `/update` | POST | `handleUpdateFinished` + `handleUpdateUpload` | âœ… |
| `/save` | POST | `handleSave` (legacy) | âœ… |
| `/save-device` | POST | `handleSaveDevice` (legacy) | âœ… |
| `/save-mqtt` | POST | `handleSaveMqtt` (legacy) | âœ… |
| `/save-calibration` | POST | `handleSaveCalibration` (legacy) | âœ… |

### K. Firmware v0.5.2 â€” AP SSID First-Boot Fix + Hardware Verification

| Change | Status |
|--------|--------|
| **Bug fixed:** AP SSID was `UMS-SETUP-0000` on first boot â€” `WiFi.macAddress()` returns zeros before WiFi driver initialises | âœ… Fixed |
| `getMacLast4()` rewritten â€” uses `esp_read_mac(mac, ESP_MAC_WIFI_STA)` from `esp_mac.h` (eFuse, no WiFi init needed) | âœ… Done |
| `#include <esp_mac.h>` added to includes | âœ… Done |
| **Compile verified** â€” Arduino CLI 1.5.0, FQBN `esp32:esp32:esp32`, core 3.3.8, 0 errors | âœ… Done |
| Flash: 1,007,268 bytes (76%) / RAM: 47,760 bytes (14%) | âœ… Confirmed |
| **Hardware verified on COM11** (ESP32-D0WD-V3, MAC `30:76:F5:A5:AD:54`) | âœ… |
| USB flash via Arduino CLI â€” upload completed, hash verified | âœ… |
| Serial boot confirmed: `v0.5.2`, `AP SSID: UMS-SETUP-AD54`, measurements streaming | âœ… |
| All four portal routes accessible from AP: `/` `/config` `/data` `/update` | âœ… HTTP 200 |
| `/data` fields confirmed: firmware=0.5.2, mac, wifi_mode, config_mode, setup_ap_enabled | âœ… |
| AP fallback confirmed: STA fails â†’ AP starts after 30 s with correct SSID `UMS-SETUP-AD54` | âœ… |
| Identity config saved via POST `/save-config` and persisted across reboot | âœ… |
| Static IP config saved (192.168.1.50) and loaded correctly after reboot â€” no crash | âœ… |
| **OTA verified end-to-end:** uploaded `0.5.1-OTA-TEST` binary, `/data` confirmed version change | âœ… |
| Historical OTA rollback test restored the then-current legacy firmware and confirmed the reported firmware field | âœ… |
| **Factory reset confirmed:** NVS cleared, board reboots to `UPSMON-UNASSIGNED` first-boot state | âœ… |
| After factory reset, AP SSID is `UMS-SETUP-AD54` (fix confirmed on first boot) | âœ… |
| WiFi STA connectivity test: not fully verified (user WiFi password required) | âš ï¸ Requires LAN access |

---

## Pending (Future Milestones)

- Multi-user DB auth with role-based access (User table exists, no UI/API yet)
- Per-device alarm rule overrides via AlarmRule table (engine uses hardcoded defaults today)
- Fleet OTA management from dashboard
- Active power (W), power factor, energy (kWh) â€” requires hardware metering IC (see MEASUREMENT_LIMITATIONS.md)
- Email/SMS/WhatsApp alarm notifications
- Production TLS / nginx reverse proxy
- Firmware Last Will / retained MQTT status topic
