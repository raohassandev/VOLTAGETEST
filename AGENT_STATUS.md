# Agent Status Report

**Agent:** Claude Sonnet 4.6 (Claude Code)
**Branch:** professionalization-plan
**Report date:** 2026-05-21
**Last commit:** see git log

---

## Completed Phases

### Phase A — Baseline verification — PASS
- Branch `professionalization-plan` confirmed
- `npm install`, `prisma validate`, lint, build all passed
- Firmware compile verified: `esp32:esp32:esp32`, no errors

### Phase B — Real board WiFi + AP behavior — PASS
- Firmware v0.5.2 flashed to COM11
- DHCP STA, AP auto-off, wrong-password fallback, `setup_ap_always`, static IP all tested
- OTA upload and factory reset verified

### Phase C — MQTT ingest + real telemetry — PASS
- Fixed timezone mismatch bug in rollup worker (commit `0602b85`)
- Board publishing to `building/site-local/ups/UPS-COM11-TEST/telemetry`
- TelemetryRaw, TelemetryLatest, Device updating correctly
- Fleet and detail pages showing live data

### Phase D — Commissioning visibility — PASS (commit `214d349`)
- 15 commissioning fields from rawJson visible in UPS detail page
- `config_mode`, `setup_ap_enabled`, RSSI < -75 highlighted in amber

### Phase E — Alarm rule overrides — PASS (commit `fda4611`)
- `resolveThresholds()`: device > UPS > site > global > hardcoded fallback
- REST API: GET/POST/PUT/DELETE `/api/alarm-rules`
- Admin UI at `/admin/alarm-rules`

### Phase F — Production auth hardening — PASS (commit `01a50b5`)
- Removed hardcoded dev token; added `ALLOW_DEV_AUTH=true` pattern
- Created `proxy.ts` (Next.js 16 convention) — `ƒ Proxy (Middleware)` confirmed in build
- `auth-edge.ts` for edge-runtime-safe auth (no bcrypt)
- `instrumentation.ts` logs FATAL on startup if production secrets missing

### Phase G — Docker deployment — OPEN (Docker not installed)
- `Dockerfile` fixed: removed `|| true` from migration command (commit `9bbc9b7`)
- `docker-compose.yml`, `Dockerfile.worker` reviewed — correct
- Cannot execute without Docker Desktop

### Phase H — Calibration guide — PASS (commit `7a5c0ec`)
- `docs/CALIBRATION_GUIDE.md`: per-channel procedure, safety warnings, tolerance targets, record template

### Phase I — Release package — PASS (commit `7a5c0ec`)
- `release/UMS_RELEASE_NOTES.md`
- `release/UMS_INSTALLER_CHECKLIST.md`
- `release/UMS_OPERATOR_GUIDE.md`
- `release/UMS_FIELD_TEST_REPORT_TEMPLATE.md`
- `release/firmware/README.md`
- `release/dashboard/.env.production.example`

### Phase J — 2-hour burn-in — PASS
```
Start:      2026-05-21 09:51:53 UTC
End:        2026-05-21 12:37:01 UTC
Duration:   2.75 hours
Seq:        0 → 1149 (monotonic, no crash loop)
Free heap:  224,676 → 220,764 bytes (stable)
Reset:      1 × POWERON_RESET (clean boot only)
Rows:       5,659 TelemetryRaw
Rollup:     161 Telemetry1m buckets
Health:     {"status":"ok","db":"connected","uptime":~23.9h}
Board:      online, firmware 0.5.2, RSSI -62 dBm
```

---

## P0 Demo Blocker Fixes

### P0.1 — volt_dc alarm engine calibration (PASS — 1dbc381)
- **Root cause confirmed:** Firmware sends raw 12-bit ADC counts (≈556) for `volt_dc` with NVS default scale=1.0. Alarm engine compared 556 against voltage thresholds (e.g. 57.024 V), always triggering CRITICAL.
- **Fix (`worker/mqtt-worker.ts`):** `runAlarmEvaluation()` now queries `CalibrationProfile` for the device. If no row exists, applies `VOLT_DC_DEFAULT_SCALE = 0.0442` (matches frontend `defaultConfig`). Calibrated value (`raw_adc × 0.0442 ≈ 24.6 V`) is passed to `evaluateAlarms`. For the live bench board (`batteryNominalV=48`), 24.6 V < lowCritical (42 V) → correctly fires **CRITICAL LOW** ("Battery Voltage critically low: 24.6 V (limit 42.0 V)"), replacing the prior false **CRITICAL HIGH** (556 V vs 57 V limit — wrong direction and value). For a 24 V UPS, 24.6 V is within normal range — no alarm fires (verified by `scripts/test-volt-dc-alarm.js`, 3/3 PASS).

### P0.2 — Duplicate active alarm rows (PASS — 1dbc381)
- **Root cause:** `evaluateAlarms()` used `findFirst` + `update/create` — race condition between multiple worker instances created duplicate rows. `debounceMap` reset on restart also caused burst creation.
- **Fix (`src/lib/alarm-engine.ts`):** Replaced `findFirst` + `update/create` with `updateMany` + conditional `create`. Clearing loop now uses `distinct: ["metric"]` + `updateMany` to collapse all duplicates in one pass.
- **Startup dedup (`worker/mqtt-worker.ts`):** Added `deduplicateActiveAlarms()` — runs 5 s after startup, deletes all but the newest active alarm per (deviceId, metric) group.

### P0.3 — Board IP in fleet table (PASS — 1dbc381)
- **Fix (`src/app/page.tsx` FleetTable):** Added "Board IP" column after RSSI. Shows `device.telemetry.ip` as clickable `http://<ip>/` link with Config / Data / OTA sub-links. Shows "—" when no IP.

### P0.4 — Board portal button on UPS detail (PASS — 1dbc381)
- **Fix (`src/app/ups/[id]/page.tsx`):** Replaced plain-text "IP Address" row with portal action buttons: "Open portal", "Config", "OTA" — each a styled `<a>` tag. Falls back to "—" when `device.ip` is null.

### P0.5 — Alarm rule UPS-scope UX (PASS — 1dbc381)
- **Fix (`src/app/admin/alarm-rules/page.tsx`):** Fetches `/api/ups` on mount. When scope = "ups", renders a `<select>` dropdown showing `upsId — name` labels but submitting the internal DB cuid. Removes the need for users to know the database ID.

### Fleet alarms — server alarm sourcing (PASS — 1dbc381)
- **Fix (`src/lib/telemetry.ts`):** Added `ServerAlarm` type and 15 s poll of `/api/alarms?state=active`.
- **Fix (`src/app/page.tsx`):** Header badge count, `FleetSummary` alarming count, FleetTable per-device status, and `UserAlarmPanel` all now driven by server alarms from the DB alarm engine. Browser-computed alarm thresholds no longer shown in the UI.

---

## Blocker Fixes Applied

### Blocker 2 — Mosquitto files (PASS — commit `9bbc9b7`)
- Created `deployment/mosquitto/acl` with proper device/dashboard ACL rules
- Created `deployment/mosquitto/mosquitto.dev.conf` for local dev (anonymous)
- Created `deployment/mosquitto/setup-passwords.sh` for production password generation
- Fixed `.gitignore`: `acl` no longer ignored; `deployment/backups/` now ignored

### Blocker 4 — Dashboard data consistency (PASS — commit `9bbc9b7`)
- Removed `MiniGauge` cards (showed single MQTT device, could show "0 V")
- Removed `TrendChart` (used in-memory browser MQTT history)
- Removed "Current transformers" and "System status" panels
- `UserAlarmPanel` now fed from `fleetDevices.flatMap(d => d.alarms)` — fleet-wide API data
- Header alarm badge consistent with fleet alarms
- Fixed `src/app/layout.tsx`: removed Google Fonts dependency

### Blocker 4b — Browser MQTT removed (PASS — 1dbc381)
- Removed `import mqtt from "mqtt"` from `web-dashboard/src/lib/telemetry.ts`
- Removed `mqtt.connect(...)` browser MQTT connection entirely
- Removed HiveMQ `wss://broker.hivemq.com:8884/mqtt` default from `defaultConfig`
- Fleet data now exclusively from `/api/telemetry/latest` (polled every 5 s)
- Header badge replaced: was "MQTT online/Connecting" → now "API online/API error/API unknown"
- Badge driven by `/api/health` polling (every 30 s), not browser MQTT state
- `expectedPublishIntervalMs` corrected: 500 → 5000 ms

### Blocker 5 — Alarm correctness (PASS — commit `9bbc9b7`)
- `alarm-engine.ts`: Added `debounceSeconds` and `hysteresisPercent` to `ThresholdCheck`; per-rule values from AlarmRule DB now used per metric
- `mqtt-worker.ts`: Removed use of `offlineThresholdSecs` as alarm debounce; separate `FALLBACK_DEBOUNCE_SECS=30` constant used instead

### Blocker 6 — Backup and restore (PASS — commit `9bbc9b7`)
```
Command: bash deployment/scripts/backup.sh
Output:  [backup] Done: deployment/backups/upsmon_20260521_173409.sql.gz (281K)
No credentials in output.
```

### Blocker 9 — Production placeholder secret guard (PASS — 1dbc381)
- `instrumentation.ts` now throws on startup if `UPS_AUTH_TOKEN`, `POSTGRES_PASSWORD`, or `MQTT_PASSWORD` contain known placeholder values
- Hard `throw new Error(...)` (not just console.error) — process crashes, container will not start

---

## Build Status
```
npm run lint:    PASS (0 errors)
npm run build:   PASS (ƒ Proxy confirmed)
prisma validate: PASS
```

---

## Remaining Blockers
| # | Blocker | Status | Action needed |
|---|---------|--------|--------------|
| 1 | Docker deployment | OPEN | Install Docker Desktop; run Phase G sequence |
| 3 | MQTT test through Docker | OPEN | Depends on Blocker 1 |
| 8 | Release readiness | IN PROGRESS | Blocked on 1+3 |

See `SHIP_BLOCKERS.md` for full evidence log.

---

## Commit History (this branch)
```
7a8f221  fix(audit): correct volt_dc test descriptions and add screenshot proof
1dbc381  fix(P0): volt_dc calibration, fleet IP column, UPS detail portal, alarm rule UPS dropdown, alarm dedup
9aaadc6  Remove browser MQTT, fix publish interval, add secret guard, update status files
9bbc9b7  Fix blockers 2/4/5/6/7: alarm engine, fleet page, mosquitto, Dockerfile, burn-in
4f396f1  chore: add agent status report
7a5c0ec  Add calibration guide and release package (Phases H + I)
01a50b5  Harden dashboard authentication defaults (Phase F)
fda4611  feat(alarms): configurable alarm rule overrides with scope resolution (Phase E)
214d349  feat(dashboard): show commissioning status in UPS detail page (Phase D)
0602b85  fix(rollup): correct timezone mismatch in 1-minute rollup query (Phase C)
7883ecc  Fix firmware v0.5.2: AP SSID first-boot bug + hardware verified (Phase B)
```

*Updated after every push.*
