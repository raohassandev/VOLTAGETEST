# UMS UPS Monitoring — Claude Shipping Execution Plan

**Repository:** `https://github.com/raohassandev/VOLTAGETEST`  
**Branch:** `professionalization-plan`  
**Role:** Claude is engineer/coder. ChatGPT/manager will review final reports and decide next changes.  
**Goal:** Ship a reliable MVP for UPS monitoring: ESP32 firmware + dashboard + PostgreSQL + MQTT worker + deployment + commissioning docs.

---

## 0. Current known state

Use this as starting context, but verify everything from the repo before editing.

### Already implemented / verified

- Firmware has commissioning portal and is now at `v0.5.2`.
- Firmware compile passed for `esp32:esp32:esp32`.
- Firmware was flashed to real ESP32 on `COM11`.
- Hardware routes tested:
  - `/`
  - `/config`
  - `/data`
  - `/update`
- OTA test succeeded:
  - OTA temporary build showed `0.5.1-OTA-TEST`.
  - Official `v0.5.2` was restored.
- Factory reset succeeded.
- Static IP save/persist test succeeded.
- AP SSID bug was fixed using eFuse MAC, so setup AP is no longer `UMS-SETUP-0000`.
- Dashboard foundation exists:
  - Next.js app
  - Prisma/PostgreSQL schema and migration
  - MQTT worker
  - rollup/retention worker
  - inventory/settings APIs
  - alarms APIs
  - UPS detail page
  - admin inventory/settings pages
  - Docker Compose with `postgres`, `mosquitto`, `web`, `mqtt-worker`

### Still not verified / not complete

- Full WiFi STA connection using correct WiFi password.
- AP auto-off after a successful STA connection, verified by actual network behavior.
- MQTT publish from real ESP32 to local/production broker.
- MQTT worker ingest from real ESP32 into PostgreSQL.
- Dashboard live fleet/UPS detail display using real board telemetry.
- Per-device alarm rule overrides using `AlarmRule` table.
- Production security hardening:
  - MQTT user/password/ACL
  - no unsafe default dashboard password in production
  - production `.env` validation
- Docker end-to-end deployment on the target server.
- Calibration with reference meter.
- Final release artifacts and operator/installer documentation.

---

## 1. Claude operating rules — reduce time and token usage

Follow these strictly.

### Do not waste time

- Do not do broad redesign.
- Do not rewrite the whole dashboard.
- Do not rewrite firmware measurement logic.
- Do not add true kW/kWh/PF/kVAR/kVARh.
- Do not add advanced analytics before MVP works end-to-end.
- Do not create duplicate documentation.
- Do not produce long explanations while working.
- Do not run unnecessary package upgrades.
- Do not refactor working code unless required to fix a blocking issue.
- Do not change public API response shapes unless necessary; if changed, update frontend and docs.

### Work style

- Work in small phases.
- Before each phase, run only the checks needed for that phase.
- After each phase, run acceptance tests.
- Commit only meaningful, tested changes.
- Push only after build/lint/test pass.
- Keep final reports short and factual.

### Code safety

- Preserve existing firmware payload keys:
  - `volt_in`
  - `volt_out`
  - `volt_dc`
  - `ct_in`
  - `ct_out`
  - `s_in_va`
  - `s_out_va`
  - `device_id`
  - `ups_id`
  - `site_id`
  - `firmware`
  - `ip`
  - `rssi`
  - `seq`
  - `free_heap`
  - `reset_reason`
- Extra fields may stay in `rawJson`.
- Do not calculate fake `pInW`, `pf`, `kWh`, etc.
- Unsupported true power fields must remain `NULL` or hidden.

### Permission boundaries

Allowed without asking:

- Read/search/analyze repo files.
- Edit/create files inside this repo.
- Run `git status`, `git diff`, `npm install`, `npm run lint`, `npm run build`, `npx prisma validate`, `npx prisma migrate deploy`, Arduino CLI compile, local scripts.
- Flash board on `COM11` only when explicitly asked in a phase below.
- Run local Mosquitto/PostgreSQL/dashboard/worker.
- Commit and push only for completed code/documentation phases requested in this plan.

Ask before:

- `git push --force`
- deleting files/folders
- changing production server files
- changing real production secrets
- OTA to a real field/production device other than the test board
- changing measurement algorithm
- installing global system packages unless the phase explicitly needs it
- modifying files outside the repo

---

## 2. Shipping definition

This project is considered **MVP shippable** only when all items below pass.

### Firmware MVP

- Firmware compiles.
- Firmware flashes to real board.
- First boot AP works.
- Config portal works.
- WiFi DHCP works.
- WiFi static IP works.
- AP stops after successful STA connection unless `setup_ap_always` is enabled.
- Wrong WiFi password triggers AP fallback.
- `/data` shows correct identity and live data.
- OTA upload works.
- Factory reset works.
- MQTT publishes to configured broker every configured interval.
- Firmware does not crash/reboot during 2-hour burn-in.

### Backend / dashboard MVP

- Fresh PostgreSQL migration works.
- `npm run lint` passes.
- `npm run build` passes.
- MQTT worker starts and reconnects cleanly.
- Real ESP32 telemetry inserts into `TelemetryRaw`.
- `TelemetryLatest` updates.
- Device `lastSeenAt`, `ip`, `firmware`, `online` update.
- Fleet page shows live board.
- UPS detail page shows live data and history.
- Alarms are created/cleared for basic conditions.
- History API uses raw for short ranges and rollup for long ranges.
- Retention cleanup does not crash.

### Deployment MVP

- Docker Compose starts:
  - `postgres`
  - `mosquitto`
  - `web`
  - `mqtt-worker`
- `/api/health` returns DB connected.
- Broker credentials are not blank in production.
- `.env.example` is complete.
- Backup/restore scripts are documented and tested.
- Commissioning guide is usable by technician.

---

# PHASE A — Repo sync and baseline verification

## Goal

Confirm the repo is clean and reproducible before more changes.

## Commands

```bash
git status
git branch --show-current
git pull origin professionalization-plan
git log --oneline -10
```

Expected branch:

```text
professionalization-plan
```

## Web dashboard checks

```bash
cd web-dashboard
npm install
npx prisma validate
npm run lint
npm run build
```

## Firmware compile check

From repo root:

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 --warnings default --export-binaries firmware/ups_monitor
```

If Arduino CLI path is needed on Windows:

```powershell
& "$env:LOCALAPPDATA\arduino-cli\arduino-cli.exe" compile --fqbn esp32:esp32:esp32 --warnings default --export-binaries firmware/ups_monitor
```

## Acceptance criteria

- Branch correct.
- Working tree understood.
- Prisma validates.
- Lint passes.
- Build passes.
- Firmware compile passes.
- No code changes unless needed to fix broken baseline.

## Final report format

```text
PHASE A REPORT
Branch:
Commit:
npm install:
prisma validate:
lint:
build:
firmware compile:
Blocking issues:
```

---

# PHASE B — Real board WiFi STA + AP behavior verification

## Goal

Complete the missing firmware hardware tests with real WiFi credentials.

## Required input from user

Ask user for:

- WiFi SSID
- WiFi password
- PC LAN IP for MQTT broker/dashboard
- Confirm test board still on `COM11`

Do not ask for production secrets.

## Board

- Port: `COM11`
- FQBN: `esp32:esp32:esp32`

## Flash latest firmware if required

```bash
arduino-cli upload -p COM11 --fqbn esp32:esp32:esp32 firmware/ups_monitor
```

Serial monitor:

```bash
arduino-cli monitor -p COM11 -c baudrate=921600
```

If serial is unreadable, try:

```bash
arduino-cli monitor -p COM11 -c baudrate=115200
```

## Test sequence

### B1 — Factory reset

Open:

```text
http://<board-ip>/factory-reset
```

or use AP portal if needed.

Confirm:

- AP appears as `UMS-SETUP-<last4MAC>`.
- Password `UMSSetup2026` works.
- Portal opens at `http://192.168.4.1`.

### B2 — DHCP STA

Configure:

- SSID
- WiFi password
- DHCP
- Device ID: `DEV-COM11-TEST`
- UPS ID: `UPS-COM11-TEST`
- Site ID: `site-local`
- Building: `Local Building`
- Floor: `Test Floor`
- Section: `Lab`
- Work area: `Bench`
- Location: `COM11 Test Board`
- `setup_ap_always`: OFF

Save and reboot.

Confirm:

- STA connects.
- Board receives LAN IP.
- AP stops after STA connects.
- `http://<board-lan-ip>/data` opens.
- `/data` shows:
  - firmware `0.5.2` or latest
  - `wifi_mode: "STA"`
  - `config_mode: false`
  - `setup_ap_enabled: false`

### B3 — Wrong password fallback

Set an intentionally wrong WiFi password.

Confirm:

- STA fails.
- After ~30 seconds AP starts.
- `wifi_mode` becomes `AP` or `AP+STA` depending runtime.
- `config_mode: true`.
- User can fix WiFi through AP portal.

### B4 — setup_ap_always

Enable:

```text
Keep setup AP always enabled
```

Confirm after reboot:

- STA connects.
- AP remains active.
- `/data` shows:
  - `wifi_mode: "AP+STA"`
  - `config_mode: false`
  - `setup_ap_enabled: true`

Turn it OFF again for production.

### B5 — Static IP

Configure static IP in same LAN.

Confirm:

- Board returns on static IP.
- `/`, `/config`, `/data`, `/update` all open.
- No reboot loop.
- Return to DHCP if user wants.

## Acceptance criteria

- DHCP STA confirmed.
- AP stop-after-STA confirmed.
- wrong password fallback confirmed.
- setup AP always option confirmed.
- static IP confirmed.

## Final report format

```text
PHASE B REPORT
Board:
Port:
Firmware:
SSID tested:
DHCP STA:
AP stopped after STA:
Wrong password fallback:
setup_ap_always:
Static IP:
Routes tested:
Remaining:
```

Commit only if code/docs were changed.

---

# PHASE C — Local MQTT broker + real ESP32 telemetry ingest

## Goal

Real board publishes MQTT to local broker, worker ingests into PostgreSQL, dashboard shows it.

## Start services

Use local PostgreSQL already installed or Docker.

If Mosquitto is installed:

```bash
mosquitto -v
```

If Docker is available:

```bash
docker compose -f deployment/docker-compose.yml up -d postgres mosquitto
```

Start dashboard:

```bash
cd web-dashboard
npm run dev
```

Start worker in another terminal:

```bash
cd web-dashboard
npm run worker:dev
```

## Configure board MQTT

On board `/config` page:

- MQTT broker host/IP: PC LAN IP, not `localhost`
- Port: `1883`
- Topic:

```text
building/site-local/ups/UPS-COM11-TEST/telemetry
```

- Publish interval: `5`

Save and reboot.

## Verify MQTT

Worker logs should show received messages.

Verify APIs:

```text
http://localhost:3000/api/health
http://localhost:3000/api/telemetry/latest
http://localhost:3000/api/devices
http://localhost:3000/api/alarms
```

Expected:

- `/api/health` DB connected.
- `DEV-COM11-TEST` appears in latest telemetry.
- `Device.lastSeenAt` updates.
- Device `ip`, `firmware`, `online` update.
- Alarms API does not crash.

## Verify DB directly

Use `psql` or Prisma Studio.

```bash
cd web-dashboard
npx prisma studio
```

Confirm:

- `TelemetryRaw` rows exist.
- `TelemetryLatest` row exists.
- `Device` row exists/updated.
- `Alarm` state reasonable.

## Verify dashboard

Open:

```text
http://localhost:3000
http://localhost:3000/admin/inventory
http://localhost:3000/ups/UPS-COM11-TEST
```

Register inventory if needed:

- UPS ID: `UPS-COM11-TEST`
- Name: `Local Test UPS`
- Site: `site-local`
- Location: `COM11 Test Board`
- Capacity VA: `1000`
- Battery nominal V: `48`
- Device ID: `DEV-COM11-TEST`

## Acceptance criteria

- Board telemetry appears in dashboard.
- Latest telemetry updates every publish interval.
- UPS detail page shows live data.
- Worker stays running for at least 30 minutes.
- No repeated DB errors.
- No firmware reboot loop.

## Final report format

```text
PHASE C REPORT
Broker method:
Board MQTT config:
Worker status:
TelemetryRaw:
TelemetryLatest:
Device status:
Fleet page:
UPS detail page:
30-min stability:
Errors:
```

Commit only if code/docs were changed.

---

# PHASE D — Dashboard commissioning visibility

## Goal

Make the dashboard useful for installers and support. Show firmware/board status fields already present in firmware payload.

## Do first

Inspect current dashboard pages and APIs. Do not redesign the UI.

## Required display fields

On fleet page and/or UPS detail page, show from `TelemetryLatest.rawJson` or first-class fields where available:

- firmware
- mac
- ip
- rssi
- seq
- free_heap
- reset_reason
- mqtt_connected
- wifi_mode
- config_mode
- setup_ap_enabled
- building
- floor
- section
- work_area
- location

## Required behavior

- If a field is missing, show `—`, not crash.
- Highlight:
  - `config_mode = true`
  - `setup_ap_enabled = true`
  - low RSSI, for example below `-75 dBm`
  - stale telemetry/offline
- Do not show passwords or secrets.
- Do not expose MQTT credentials.

## Add small API normalization if needed

If current API returns raw JSON inconsistently, normalize in one helper.

Do not create DB migration unless necessary.

## Tests

```bash
cd web-dashboard
npm run lint
npm run build
```

Also verify pages in browser:

- `/`
- `/ups/UPS-COM11-TEST`
- `/admin/inventory`
- `/alarms`

## Acceptance criteria

- Installer can see firmware version, IP, WiFi mode, config mode, AP status, RSSI, free heap, reset reason.
- UI handles missing fields.
- Build and lint pass.

## Commit

```bash
git add .
git commit -m "Show firmware commissioning status in dashboard"
git push origin professionalization-plan
```

## Final report format

```text
PHASE D REPORT
Commit:
Files changed:
Fields displayed:
Pages updated:
lint:
build:
Remaining:
```

---

# PHASE E — Alarm rule overrides MVP

## Goal

Use the existing `AlarmRule` table so different UPS units can have different thresholds.

## Current limitation

Alarm engine currently uses hardcoded defaults. This is not enough for shipping because battery banks and UPS ratings can differ.

## Scope

Implement minimum useful alarm override system.

## Backend requirements

Add/update APIs:

```text
GET /api/alarm-rules
POST /api/alarm-rules
PUT /api/alarm-rules/[id]
DELETE /api/alarm-rules/[id]
```

Support rule scopes:

- global default
- site-level
- UPS-level
- device-level

Resolution priority:

1. device rule
2. UPS rule
3. site rule
4. global default
5. hardcoded fallback

## Required metrics

At minimum:

- `volt_in`
- `volt_out`
- `volt_dc`
- `ct_in`
- `ct_out`
- `s_out_va`
- `offline`
- `load_percent`

## Dashboard UI

Add a simple admin page or section:

```text
/admin/alarm-rules
```

Fields:

- scope
- metric
- label
- low warning
- low critical
- high warning
- high critical
- debounce seconds
- hysteresis percent
- enabled

## Safety

- Do not break current alarm engine if no rules exist.
- Validate numeric values.
- Do not allow impossible threshold order, for example warning more severe than critical.
- Add clear default rules from seed if useful.

## Tests

Use simulated MQTT payloads:

1. Normal voltage -> no alarm.
2. Low input warning -> warning alarm.
3. Low input critical -> critical alarm.
4. Return to normal -> alarm clears after debounce/hysteresis.
5. Output overload based on capacity VA.
6. Offline alarm after threshold.

## Commands

```bash
cd web-dashboard
npx prisma validate
npm run lint
npm run build
```

## Commit

```bash
git add .
git commit -m "Add configurable alarm rule overrides"
git push origin professionalization-plan
```

## Final report format

```text
PHASE E REPORT
Commit:
APIs added:
UI page:
Rule resolution:
Tests performed:
lint:
build:
Remaining:
```

---

# PHASE F — Production auth and secrets hardening

## Goal

Remove unsafe production defaults.

## Inspect first

Check:

- `web-dashboard/src/lib/auth.ts`
- login page
- middleware/protected route logic
- `.env.example`
- Dockerfile
- deployment docs

## Requirements

- In production, app must fail startup or block login if default weak credentials are used.
- No fallback `admin/admin12345` in production.
- Support hashed password via `UPS_AUTH_PASSWORD_HASH`.
- Support emergency local/dev password only when `NODE_ENV !== "production"` or explicit `ALLOW_DEV_AUTH=true`.
- `.env.example` must show secure setup.

## Optional DB auth

If low effort and clean:

- Use `User` table for login.
- Seed admin only from env:
  - `ADMIN_USERNAME`
  - `ADMIN_PASSWORD_HASH`
- Do not create default admin silently in production.

If DB auth is too large, keep env-hash auth for MVP but document it clearly.

## Tests

```bash
cd web-dashboard
npm run lint
npm run build
```

Manual:

- Dev login works.
- Production mode with missing/weak secrets fails safely.
- Production mode with hash works.

## Commit

```bash
git add .
git commit -m "Harden dashboard authentication defaults"
git push origin professionalization-plan
```

## Final report format

```text
PHASE F REPORT
Commit:
Auth mode:
Production default behavior:
Dev behavior:
Secrets required:
lint:
build:
Remaining:
```

---

# PHASE G — Docker deployment end-to-end

## Goal

Prove the deployment package works on a clean machine/server.

## Required services

- postgres
- mosquitto
- web
- mqtt-worker

## Steps

From fresh clone:

```bash
git clone --branch professionalization-plan https://github.com/raohassandev/VOLTAGETEST.git UMS-verify
cd UMS-verify
cp web-dashboard/.env.example .env
```

Create secure local test env values. Do not use production secrets.

Run:

```bash
docker compose -f deployment/docker-compose.yml --env-file .env config
docker compose -f deployment/docker-compose.yml --env-file .env up -d --build
docker compose -f deployment/docker-compose.yml --env-file .env ps
```

Health:

```bash
curl http://localhost:3000/api/health
```

Logs:

```bash
docker compose -f deployment/docker-compose.yml --env-file .env logs --tail=100 web
docker compose -f deployment/docker-compose.yml --env-file .env logs --tail=100 mqtt-worker
docker compose -f deployment/docker-compose.yml --env-file .env logs --tail=100 mosquitto
```

Publish test payload:

```bash
mosquitto_pub -h localhost -p 1883 -t building/site-local/ups/UPS-DOCKER-TEST/telemetry -m "{\"device_id\":\"DEV-DOCKER-TEST\",\"site_id\":\"site-local\",\"ups_id\":\"UPS-DOCKER-TEST\",\"volt_in\":230,\"volt_out\":229,\"volt_dc\":52,\"ct_in\":1.2,\"ct_out\":1.1,\"s_in_va\":276,\"s_out_va\":252,\"rssi\":-60,\"ip\":\"192.168.1.200\",\"firmware\":\"0.5.2\",\"seq\":1,\"free_heap\":120000,\"mac\":\"AA:BB:CC:DD:EE:FF\",\"reset_reason\":\"POWERON_RESET\"}"
```

Verify:

```text
http://localhost:3000/api/telemetry/latest
http://localhost:3000/api/devices
http://localhost:3000/api/alarms
```

## Backup/restore

Test:

```bash
bash deployment/scripts/backup.sh
bash deployment/scripts/health-check.sh
```

Restore should be tested on a test database only.

## Acceptance criteria

- Docker stack starts.
- Migrations apply.
- Health OK.
- Worker ingests MQTT sample.
- Dashboard shows sample device.
- Backup script produces file.
- Logs have no repeated crash loop.

## Commit

Only commit if deployment files/docs changed.

```bash
git add .
git commit -m "Verify and document Docker deployment flow"
git push origin professionalization-plan
```

## Final report format

```text
PHASE G REPORT
Commit:
Docker compose config:
Docker up:
Health:
MQTT publish:
Telemetry latest:
Devices:
Backup:
Errors:
Remaining:
```

---

# PHASE H — Calibration workflow for shipment

## Goal

Ship a practical calibration process without pretending true energy analyzer behavior.

## Requirements

Document and/or improve existing calibration form.

Calibration must cover:

- input AC voltage scale/offset
- output AC voltage scale/offset
- battery DC voltage scale/offset
- input CT scale/offset
- output CT scale/offset
- AC zero ADC if applicable

## Documentation file

Create or update:

```text
docs/CALIBRATION_GUIDE.md
```

Include:

- required tools
- safety warnings
- how to connect reference meter
- calibration order
- how to verify after calibration
- acceptable tolerance target
- what values are not supported yet
- how to record calibration per UPS

## Optional dashboard

If simple, add a calibration note/field in UPS detail page. Do not build full calibration management unless quick.

## Acceptance criteria

- Technician can calibrate a board using the guide.
- No kW/kWh/PF claim.
- Guide explains VA is apparent estimate only.

## Commit

```bash
git add .
git commit -m "Add UPS monitor calibration guide"
git push origin professionalization-plan
```

## Final report format

```text
PHASE H REPORT
Commit:
Docs changed:
Calibration fields covered:
Limitations stated:
Remaining:
```

---

# PHASE I — Release package

## Goal

Create final deliverables for shipment.

## Deliverables

Create:

```text
release/
  UMS_RELEASE_NOTES.md
  UMS_INSTALLER_CHECKLIST.md
  UMS_OPERATOR_GUIDE.md
  UMS_FIELD_TEST_REPORT_TEMPLATE.md
  firmware/
    ups_monitor_v0.5.2.bin
  dashboard/
    .env.production.example
```

If binary cannot be committed due repo policy, place it in `release/firmware/README.md` with exact command to build it.

## Release notes must include

- firmware version
- dashboard version/commit
- supported features
- unsupported features
- deployment steps
- rollback plan
- known limitations

## Installer checklist must include

- board flash
- AP setup
- WiFi setup
- static IP optional
- MQTT setup
- inventory registration
- dashboard verification
- OTA test
- calibration
- burn-in

## Field test report template must include

- UPS ID
- Device ID
- MAC
- IP
- firmware
- WiFi RSSI
- measurement readings
- reference meter readings
- calibration values
- MQTT status
- alarm status
- notes/signoff

## Commit

```bash
git add .
git commit -m "Add UMS release package and field checklists"
git push origin professionalization-plan
```

## Final report format

```text
PHASE I REPORT
Commit:
Release files:
Firmware binary:
Checklist:
Operator guide:
Known limitations:
```

---

# PHASE J — 2-hour burn-in test

## Goal

Before shipping, prove board + broker + worker + dashboard survive continuous operation.

## Setup

- Real board on WiFi.
- MQTT broker running.
- Worker running.
- Dashboard running.
- PostgreSQL running.

## Test duration

Minimum:

```text
2 hours
```

## Monitor

Every 15 minutes record:

- firmware version
- seq
- free_heap
- reset_reason
- RSSI
- telemetry latest time
- raw row count increase
- alarms active
- worker still running
- dashboard health
- board reachable at `/data`

## Acceptance criteria

- No firmware crash/reset loop.
- No worker crash.
- No DB connection loss.
- Telemetry sequence increases.
- Free heap not continuously decreasing.
- Dashboard remains reachable.
- Board remains reachable.
- No false critical alarms unless caused by actual readings.

## Final report format

```text
PHASE J REPORT
Start time:
End time:
Board firmware:
Seq start/end:
Free heap start/end:
RSSI range:
Telemetry rows:
Worker status:
Dashboard status:
Alarms:
Resets:
Pass/Fail:
```

Do not fake this test. If full 2 hours cannot be run, report actual duration.

---

# Final shipping checklist

Claude must not mark the project shipped until all are checked.

```text
[ ] Fresh repo build passes
[ ] Firmware compile passes
[ ] Firmware flashed to COM11
[ ] OTA tested
[ ] Factory reset tested
[ ] WiFi DHCP tested with correct password
[ ] AP stops after STA connection
[ ] Wrong password fallback tested
[ ] Static IP tested
[ ] Real MQTT publish from board tested
[ ] MQTT worker ingest tested
[ ] Dashboard fleet live data tested
[ ] UPS detail live data tested
[ ] History/raw/rollup tested
[ ] Alarms tested
[ ] Alarm rule overrides implemented or explicitly deferred by manager
[ ] Auth production defaults hardened
[ ] Docker deployment tested
[ ] Backup tested
[ ] Calibration guide complete
[ ] Release package complete
[ ] 2-hour burn-in passed
```

---

# Exact final response Claude must give after all phases

```text
UMS SHIPPING FINAL REPORT

Repo:
Branch:
Final commit:
Firmware version:
Dashboard version/commit:

Firmware:
- compile:
- USB flash:
- OTA:
- factory reset:
- DHCP WiFi:
- static IP:
- AP fallback:
- MQTT publish:
- burn-in:

Backend/dashboard:
- npm install:
- prisma validate:
- migrate:
- lint:
- build:
- worker:
- raw/latest:
- rollup:
- alarms:
- dashboard pages:

Deployment:
- docker compose:
- health:
- backup:
- restore:
- env/security:

Docs/release:
- commissioning guide:
- calibration guide:
- operator guide:
- installer checklist:
- release notes:

Known limitations:
- no true kW/kWh/PF/kVAR/kVARh yet
- any other limitations

Ship decision:
PASS / FAIL

Blocking items if FAIL:
1.
2.
3.
```
