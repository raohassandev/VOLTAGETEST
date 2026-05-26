# UMS Repository Cleanup, Naming, QA Screenshot, and Final Audit Guide

Use this as **one complete Claude prompt**. Do not split into small prompts. The goal is to clean the repository, remove redundant/unused files, standardize naming, run Playwright/Chromium visual checks, capture screenshots, push the fixed branch, and produce a clear audit report.

---

## Goal

Prepare `energy-analyzer-integration` for a clean release candidate.

This pass is **cleanup + proof**, not new feature development.

Main objectives:

1. Remove unused, duplicate, stale, redundant files and code.
2. Correct naming conventions across firmware, backend, frontend, docs, scripts, and tests.
3. Make the repo easy for future engineers to understand.
4. Verify current UI/UX by Playwright/Chromium screenshots.
5. Verify board display / board web UI screenshots if the device is reachable.
6. Update audit report and fixing guidelines.
7. Push all fixes to GitHub.

Do not add new features unless required to fix an audit point.

---

## Branch

Work only on:

```bash
git fetch origin
git checkout energy-analyzer-integration
git pull --ff-only origin energy-analyzer-integration
```

Before changing anything, run:

```bash
git status --short
git branch --show-current
git rev-parse --short HEAD
git log --oneline -10
```

---

## Important Rule

Do not claim complete without proof.

Every item in the final report must show:

- file changed
- reason
- test run
- pass/fail result
- screenshot path if visual

---

# Part A â€” Repository Cleanup

## A1. Identify duplicate/stale firmware files

There must be only one canonical firmware source:

```text
firmware/VOLTAGETEST/VOLTAGETEST.ino
```

Audit these files:

```text
VOLTAGETEST.ino
firmware/VOLTAGETEST/VOLTAGETEST.ino
firmware/ups_monitor/ups_monitor.ino
firmware/README.md
docs/*
release/*
```

### Required action

If root `VOLTAGETEST.ino` exists and differs from canonical firmware:

Choose one safe action:

1. Delete root `VOLTAGETEST.ino`, OR
2. Replace root `VOLTAGETEST.ino` with a short comment stub:

```cpp
// DO NOT FLASH THIS FILE.
// Canonical firmware is located at:
// firmware/VOLTAGETEST/VOLTAGETEST.ino
```

Preferred: **remove the root `.ino`** if build/tests do not require it.

Do not keep two different firmware files.

### Verification

Run:

```bash
find . -name "*.ino" -print
```

Final expected:

```text
firmware/VOLTAGETEST/VOLTAGETEST.ino
```

or root stub only if intentionally kept.

---

## A2. Remove obsolete old firmware folder

Audit:

```text
firmware/ups_monitor/
```

If it is old UPS monitor firmware and not used anymore, remove it or move it to:

```text
archive/firmware/ups_monitor_legacy/
```

Preferred for clean release: remove from active tree and document legacy in release notes.

### Verification

Search old firmware topics:

```bash
grep -R "building/.*/ups\|building/+/ups\|UPSMON" -n . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=.next \
  --exclude-dir=test-results \
  --exclude-dir=playwright-report
```

Any remaining old topic must be either:

- in migration/history docs only, or
- marked as legacy, not active production.

---

## A3. Remove generated build artifacts unless intentionally versioned

Audit whether firmware compiled binaries should be committed:

```text
firmware/VOLTAGETEST/build/
*.bin
*.elf
*.map
*.hex
```

If the project policy is source-only, remove build artifacts and add to `.gitignore`.

If binaries are intentionally committed for OTA release, move them to a clear release folder:

```text
release/firmware/v1.0.0/
```

and document hash/checksum.

### Preferred

For clean Git repo:

```bash
git rm -r firmware/VOLTAGETEST/build || true
```

Add to `.gitignore`:

```gitignore
firmware/**/build/
*.elf
*.map
*.hex
```

If keeping `.bin`, keep only the final OTA `.bin` under `release/firmware/v1.0.0/`.

---

## A4. Remove test reports and runtime folders from source

Check and remove if tracked:

```text
playwright-report/
test-results/
.next/
node_modules/
coverage/
dist/
tmp/
*.log
```

Update `.gitignore`.

Run:

```bash
git ls-files | grep -E '(^|/)(node_modules|\.next|playwright-report|test-results|coverage|dist|tmp)/|\.log$'
```

If anything appears and is not intentionally versioned, remove it from Git.

---

## A5. Remove unused debug/demo/test data files

Search:

```bash
grep -R "SMOKE-TEST-001\|UPS-SMOKE-001\|DOCKER-SMOKE-001\|kk\|099\|test alarm\|runtime certification" -n . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=.next
```

Do not remove valid smoke-test scripts, but remove or clean:

- stale screenshots
- old debug text
- old seeded comments
- dead demo records
- old temporary docs

If test devices are required for certification, keep them only in:

```text
deployment/certify.sh
scripts/
tests/
```

They should not appear as production default data.

---

# Part B â€” Naming Convention Cleanup

## B1. Firmware naming

Use consistent names:

| Concept | Required naming |
|---|---|
| Firmware folder | `firmware/VOLTAGETEST/` |
| Canonical sketch | `firmware/VOLTAGETEST/VOLTAGETEST.ino` |
| Firmware version constant | `FIRMWARE_VERSION` |
| Publish interval constant | `MQTT_PUBLISH_MS` |
| Device ID | `device_id` in JSON, `deviceId` in DB/TS |
| MQTT topic | `ums/devices/{device_id}/data` |
| Firmware API info | `/api/info` |
| Firmware live data | `/data` |

Avoid mixed names:

```text
UPSMON
ups_monitor
building/site/ups
old telemetry
```

except in legacy documentation.

---

## B2. TypeScript naming

Use:

| Layer | Naming |
|---|---|
| JSON API | snake_case, e.g. `p_out_w` |
| Prisma/DB | camelCase, e.g. `pOutW` |
| React props/state | camelCase where internal |
| UI labels | human-readable, e.g. `Output W` |

Do not mix DB camelCase directly into JSON response unless it is a rollup API already designed that way.

Recommended API JSON names:

```text
volt_in
volt_out
volt_dc
ct_in
ct_out
s_in_va
s_out_va
p_in_w
p_out_w
pf_in
pf_out
freq_in
freq_out
q_in_var
q_out_var
e_in_kwh
e_out_kwh
firmware
ip
rssi
seq
```

---

## B3. Page naming

Use consistent admin pages:

```text
/admin/settings
/admin/system-parameters
/admin/history-control
/admin/feature-flags
/admin/alarm-rules
/admin/users
/boards
/alarms
/inventory
/ups/[id]
```

If any route is unused or duplicate, remove or redirect.

---

## B4. Documentation naming

Create or update these final docs:

```text
docs/ARCHITECTURE.md
docs/FIRMWARE_GUIDE.md
docs/CALIBRATION_GUIDE.md
docs/MQTT_TOPICS.md
docs/DEPLOYMENT.md
docs/TESTING_AND_CERTIFICATION.md
docs/MEASUREMENT_LIMITATIONS.md
docs/CLEANUP_AUDIT_REPORT.md
release/UMS_RELEASE_NOTES.md
release/UMS_OPERATOR_GUIDE.md
```

Remove duplicate docs with similar names unless they contain unique content.

---

# Part C â€” Code Dead-Path Audit

## C1. Search for old MQTT topics

Run:

```bash
grep -R "building/+/ups\|building/.*/ups\|UPSMON\|ups_monitor" -n . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=.next \
  --exclude-dir=playwright-report \
  --exclude-dir=test-results
```

Expected production active code:

```text
No active old topic.
```

Allowed only in migration/legacy notes.

---

## C2. Search for old unsupported W/PF/kWh text

Run:

```bash
grep -R "not computed\|not supported\|future hardware\|W/PF/kWh\|Active power.*not" -n docs release web-dashboard/src firmware \
  --exclude-dir=node_modules \
  --exclude-dir=.next
```

Update stale docs. The correct statement is:

```text
Energy-analyzer firmware supports W, PF, kWh, VAR, and frequency when waveform-sampling firmware is installed and calibrated.

If a value is not valid, firmware publishes null and the UI shows Not available.

Accuracy depends on voltage/current calibration, CT calibration, and phase alignment.
```

If active power/PF/kWh are still not reliable on current hardware, state exactly:

```text
Code supports the field, but production accuracy requires reference-meter calibration.
```

Do not write contradictory â€œfuture hardware onlyâ€ unless true.

---

## C3. Search for disabled/coming-soon pages

Run:

```bash
grep -R "coming soon\|TODO\|FIXME\|placeholder\|not implemented" -n web-dashboard/src docs release \
  --exclude-dir=node_modules \
  --exclude-dir=.next
```

For each result:

- fix if it is active UI,
- document if it is intentionally future scope,
- remove if obsolete.

---

## C4. Search for console/debug code

Run:

```bash
grep -R "console.log\|debugger\|TODO\|FIXME" -n web-dashboard/src web-dashboard/worker firmware \
  --exclude-dir=node_modules \
  --exclude-dir=.next
```

Allowed only if clearly useful operational logging.

Remove noisy debug logs.

---

## C5. Search for unused imports/files

Run:

```bash
cd web-dashboard
npm run lint
```

Also run TypeScript check if available:

```bash
npm run typecheck
```

If no `typecheck` script exists, add one only if it does not disrupt project:

```json
"typecheck": "tsc --noEmit"
```

Do not create massive unrelated formatting diffs.

---

# Part D â€” Firmware Cleanup

## D1. Firmware code readability

Review `firmware/VOLTAGETEST/VOLTAGETEST.ino`.

Break into logical sections using comments:

```cpp
// Identity / Version
// Pins / ADC Configuration
// Calibration State
// WiFi Configuration
// MQTT Configuration
// Measurement Calculation
// Energy Persistence
// HTTP Routes
// OTA
// Main Loop
```

Do not change working logic unless fixing audit points.

---

## D2. Firmware config page

Fix password behavior:

- Do not display saved MQTT password.
- Password field placeholder:

```text
Leave blank to keep existing password
```

- Blank submit must keep existing password.
- Add explicit checkbox/button only if clearing password is needed.

Also ensure config page includes:

```text
MQTT host
MQTT port
MQTT username
MQTT password
MQTT auth enabled/status
device_id
firmware version
topic preview
```

---

## D3. `/api/info`

Verify response includes:

```json
{
  "device_id": "...",
  "firmware": "1.0.0",
  "mac": "...",
  "ip": "...",
  "mqtt_host": "...",
  "mqtt_port": 1883,
  "mqtt_topic": "ums/devices/<device_id>/data",
  "mqtt_auth": true
}
```

If `mqtt_auth=false`, show it honestly.

---

## D4. `/data`

Verify response includes the same telemetry fields as MQTT payload.

Do not return fake zero for invalid waveform values. Use `null`.

---

# Part E â€” Backend Cleanup

## E1. MQTT worker

Verify:

```text
nullableNum() preserves null
mqtt-worker subscribes to ums/devices/+/data
mqtt-worker stores firmware version
mqtt-worker stores IP/RSSI/seq
mqtt-worker passes all energy fields to alarm engine
```

Add unit tests if existing test style supports it.

---

## E2. API routes

Verify latest API:

```bash
GET /api/telemetry/latest
```

Includes all new energy fields.

Verify history API:

```bash
GET /api/telemetry/history
```

Includes raw and rollup fields.

Verify config route in Docker mode:

```text
ENABLE_EMBEDDED_BROKER=false
/api/devices/[deviceId]/config returns 501 with clear message
```

---

## E3. Rollup

Verify kWh LAST-by-time.

Add/keep test case:

```text
Same minute:
first e_out_kwh = 100
later e_out_kwh = 0.2
rollup eOutKwhLast = 0.2
```

---

# Part F â€” UI/UX Audit

Use Playwright/Chromium.

## F1. Required desktop screenshots

Take screenshots at **1440Ã—900**:

```text
Dashboard
UPS detail page
Alarms
Alarm Rules
Inventory
Boards
Settings
Users
System Parameters
History Control
Feature Flags
Login
Welcome / expired session page
```

Save to:

```text
qa/screenshots/web/desktop/
```

Suggested filenames:

```text
01-dashboard-desktop.png
02-ups-detail-desktop.png
03-alarms-desktop.png
04-alarm-rules-desktop.png
05-inventory-desktop.png
06-boards-desktop.png
07-settings-desktop.png
08-users-desktop.png
09-system-parameters-desktop.png
10-history-control-desktop.png
11-feature-flags-desktop.png
12-login-desktop.png
13-welcome-expired-desktop.png
```

---

## F2. Required mobile screenshots

Take screenshots at **390Ã—844** or similar:

```text
Dashboard
UPS detail
Alarms
Boards
Settings
Navigation drawer/menu
Login
```

Save to:

```text
qa/screenshots/web/mobile/
```

---

## F3. Board web UI screenshots

If the board at `192.168.0.100` is reachable, take screenshots of:

```text
http://192.168.0.100/
http://192.168.0.100/api/info
http://192.168.0.100/data
http://192.168.0.100/calib
http://192.168.0.100/update
```

Save to:

```text
qa/screenshots/board/
```

Suggested filenames:

```text
01-board-home.png
02-board-api-info.png
03-board-data.png
04-board-calibration.png
05-board-ota.png
```

If board is not reachable, report:

```text
Board screenshots not taken â€” device unreachable from this machine.
```

Do not fake board screenshots.

---

## F4. Screenshot audit checklist

For each screenshot, verify:

- no red Next.js error overlay
- no broken cards
- no overlapping text
- no old unsupported W/PF/kWh text
- no old MQTT topic visible
- values show `â€”` or `Not available` instead of fake 0 when null
- dashboard shows online device if live telemetry is available
- mobile layout has no horizontal overflow
- buttons are not clipped
- dark theme readability is acceptable

---

# Part G â€” Playwright / Chromium Commands

Run:

```bash
cd web-dashboard
npm run lint
npm run build
npm test
npx playwright test
```

If the project has a custom test command, use it and report exact command.

Generate screenshots using Playwright. If no screenshot script exists, create:

```text
web-dashboard/tests/visual-screenshots.spec.ts
```

The test should:

- login as manufacturer/admin using test credentials
- navigate pages
- save screenshots
- not fail only because a live device is offline, unless online proof is the specific test

Store screenshots in `qa/screenshots/...`.

---

# Part H â€” Runtime Proof

## H1. Docker proof

Run:

```bash
cd deployment
docker compose down --remove-orphans
docker compose up -d --build
docker compose ps
```

Then:

```bash
bash certify.sh
```

Expected:

```text
postgres healthy
mosquitto up
mqtt-worker up
web healthy
certify.sh PASS
```

---

## H2. Real board proof

If board is reachable:

```bash
curl -s http://192.168.0.100/api/info | jq .
curl -s http://192.168.0.100/data | jq .
```

Expected:

```text
device_id = UMS-3076F5A5AD54
firmware = 1.0.0
mqtt_auth = true if configured for production
mqtt_host = local broker/server
mqtt_topic = ums/devices/UMS-3076F5A5AD54/data
```

Then verify backend DB:

```sql
select "deviceId", online, "lastSeenAt", ip, firmware
from "Device"
order by "lastSeenAt" desc;

select "deviceId", "receivedAt", "voltIn", "pOutW", "pfOut", "freqIn", "eOutKwh"
from "TelemetryLatest"
order by "receivedAt" desc;
```

Dashboard should show the live board online.

---

# Part I â€” Database Cleanup

Do not delete production data blindly.

First run dry run:

```bash
cd web-dashboard
npm run db:cleanup-test:dry
```

Review output.

Then only if correct:

```bash
npm run db:cleanup-test
```

Cleanup should remove or archive only:

```text
UPS-SMOKE-001
SMOKE-TEST-001
DOCKER-SMOKE-001 if not needed
old smoke alarms
old junk comments like 099, kk, test
```

Do not remove real board:

```text
UMS-3076F5A5AD54
```

Do not remove real production inventory.

---

# Part J â€” Audit Report and Fixing Guidelines

Update or create:

```text
docs/CLEANUP_AUDIT_REPORT.md
docs/FIXING_GUIDELINES.md
docs/TESTING_AND_CERTIFICATION.md
docs/MEASUREMENT_LIMITATIONS.md
```

## J1. CLEANUP_AUDIT_REPORT.md

Must include:

```text
Branch:
Commit:
Date:
Files removed:
Files renamed:
Files kept intentionally:
Old topics removed:
Firmware canonical path:
Docker topic:
Board API endpoints:
Tests run:
Screenshot paths:
Remaining non-code tasks:
Ship decision:
```

## J2. FIXING_GUIDELINES.md

Must include rules:

```text
Do not edit root firmware; use canonical path only.
Do not use old MQTT topic.
Do not store null telemetry as zero.
Do not add dashboard fields unless API returns them.
Do not claim hardware accuracy without reference meter.
Do not enable config/command buttons unless firmware subscribes.
Do not commit node_modules/.next/playwright-report/test-results.
Always run lint/build/tests before pushing.
Always include screenshots for UI changes.
```

---

# Part K â€” Git Push

After fixes:

```bash
git status --short
git diff --stat
git diff --name-status
```

Commit with a clear message:

```bash
git add -A
git commit -m "chore: cleanup release candidate and add visual audit evidence"
git push origin energy-analyzer-integration
```

If no changes were needed:

```bash
git status --short
```

and report no-op honestly.

---

# Final Report Format

Return exactly:

```text
Branch:
Commit before:
Commit after:

Cleanup:
- Files removed:
- Files renamed:
- Files kept intentionally:
- Duplicate firmware resolved:
- Old topic search result:
- Stale docs fixed:

Naming:
- Firmware naming:
- MQTT naming:
- API/DB naming:
- UI route naming:

Firmware:
- Canonical path:
- Compile result:
- /api/info result:
- /data result:
- OTA page screenshot:
- MQTT auth status:

Backend:
- MQTT topic:
- nullableNum status:
- latest API:
- history API:
- rollup kWh LAST:
- alarm energy fields:

UI/UX:
- Desktop screenshots:
- Mobile screenshots:
- Board screenshots:
- Issues found:
- Issues fixed:

Tests:
- npm run lint:
- npm run build:
- npm test / Playwright:
- docker compose:
- certify.sh:
- real board telemetry:

Database cleanup:
- dry run:
- actual cleanup:
- removed records:
- real records preserved:

Docs:
- Audit report:
- Fixing guidelines:
- Testing/certification docs:
- Measurement limitations:

Git:
- pushed yes/no:
- branch:
- commit:

Remaining:
- physical calibration:
- production broker credential setup:
- any known limitation:

Ship decision:
```

Ship decision options:

```text
PASS â€” ready to merge and tag
PASS WITH CONDITIONS â€” only physical calibration or customer-site config remains
FAIL â€” code/runtime blocker remains
```

---

## Strict Rules

- Do not say â€œcompleteâ€ if dashboard still shows real board offline.
- Do not say â€œcompleteâ€ if board screenshots are missing without reason.
- Do not say â€œcompleteâ€ if old firmware duplicates remain.
- Do not say â€œcompleteâ€ if old MQTT topic remains active.
- Do not say â€œcompleteâ€ if `npm run build` or Playwright fails.
- Do not say â€œcompleteâ€ if changes are not pushed.
