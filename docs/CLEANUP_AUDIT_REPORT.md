# Cleanup Audit Report — UMS

**Branch:** `energy-analyzer-integration`  
**Date:** 2026-05-24  
**Auditor:** Development Team  

---

## Repository State Before Cleanup

**Commit before:** `d809146`

Issues found:
- Root `VOLTAGETEST.ino` (1059 lines) — stale, different from canonical (1175 lines)
- `firmware/ups_monitor/` — legacy firmware, old topic scheme, still in active tree
- `firmware/VOLTAGETEST/build/` and `firmware/build/` — compiled binaries committed to git (16 files)
- `deployment/mosquitto/acl.example` — referenced old `building/.../telemetry` topics
- `docs/COMMISSIONING_GUIDE.md`, `docs/DEPLOYMENT_GUIDE.md` — referenced old firmware path and topic
- `.gitignore` — did not exclude firmware build dirs, .elf/.map files, playwright-report
- Missing docs: ARCHITECTURE.md, FIRMWARE_GUIDE.md, MQTT_TOPICS.md, FIXING_GUIDELINES.md, TESTING_AND_CERTIFICATION.md

---

## Files Removed from Git

| File | Reason |
|------|--------|
| `VOLTAGETEST.ino` (root) | Stale copy — differs from canonical; canonical is `firmware/VOLTAGETEST/VOLTAGETEST.ino` |
| `firmware/VOLTAGETEST/build/**` (10 files) | Build artifacts — not source; untracked + ignored |
| `firmware/build/**` (6 files) | Old standalone build artifacts — not source; untracked + ignored |

---

## Files Archived

| From | To | Reason |
|------|----|--------|
| `firmware/ups_monitor/ups_monitor.ino` | `archive/firmware/ups_monitor_legacy/ups_monitor.ino` | Legacy firmware — old topic scheme |
| `firmware/ups_monitor/README.md` | `archive/firmware/ups_monitor_legacy/README.md` | Accompanying readme |

Added `archive/firmware/ups_monitor_legacy/LEGACY_NOTICE.md` to document why it was archived.

---

## Files Created

| File | Purpose |
|------|---------|
| `release/firmware/v2.1.0/VOLTAGETEST-v2.1.0.merged.bin` | Canonical OTA binary for v2.1.0 |
| `docs/ARCHITECTURE.md` | System architecture, components, data models, API routes |
| `docs/FIRMWARE_GUIDE.md` | v2.1.0 compile/flash/OTA/config reference |
| `docs/MQTT_TOPICS.md` | Topic scheme, payload format, auth, ACL, legacy reference |
| `docs/FIXING_GUIDELINES.md` | Rules for making changes — naming, MQTT, null handling, git |
| `docs/TESTING_AND_CERTIFICATION.md` | How to run tests, Docker cert, DB cleanup, visual screenshots |
| `docs/CLEANUP_AUDIT_REPORT.md` | This file |
| `archive/firmware/ups_monitor_legacy/LEGACY_NOTICE.md` | Legacy firmware deprecation notice |
| `web-dashboard/e2e/visual-screenshots.spec.ts` | Playwright visual screenshot spec (desktop + mobile) |

---

## Files Updated

| File | Change |
|------|--------|
| `.gitignore` | Added `firmware/**/build/`, `*.elf`, `*.map`, `*.hex`, `playwright-report/`, `e2e/report/`, `qa/screenshots/` |
| `deployment/mosquitto/acl.example` | Updated to `ums/devices/%u/data` topic scheme |
| `docs/DEPLOYMENT_GUIDE.md` | Updated MQTT_TOPIC default, firmware path reference |
| `docs/COMMISSIONING_GUIDE.md` | Added v2.1.0 version notice at top |
| `web-dashboard/src/app/admin/system/history/page.tsx` | Fixed `react-hooks/set-state-in-effect` lint error |
| `web-dashboard/e2e/helpers.ts` | Removed unused `expect` import |
| `web-dashboard/e2e/11-api-smoke.spec.ts` | Removed unused `_` parameter |

---

## Firmware Canonical Path

```
firmware/VOLTAGETEST/VOLTAGETEST.ino
```

No other `.ino` files exist in the active tree.

---

## Old Topic Search Result

Remaining references to `building/.../ups` or `UPSMON`:

- `docs/COMMISSIONING_GUIDE.md` — present but now preceded by a version notice; content is accurate for the version it describes (v0.5.1)
- `docs/DEPLOYMENT_GUIDE.md` — MQTT_TOPIC default updated to `ums/devices/+/data`
- `deployment/mosquitto/acl.example` — updated to new scheme
- All active production code (`mqtt-worker.ts`, `.env`, `docker-compose.yml`) uses `ums/devices/+/data` ✅

---

## Docker Topic

Worker MQTT topic: `ums/devices/+/data`  
Confirmed in: `deployment/.env.example`, `docker-compose.yml`, `mqtt-worker.ts`

---

## Board API Endpoints

Board at `http://192.168.0.100` was **not reachable** from this machine at time of audit.

Expected responses (from firmware v2.1.0 source):

```json
GET /api/info → { "device_id": "UMS-3076F5A5AD54", "firmware": "2.1.0", "mqtt_auth": true, "mqtt_topic": "ums/devices/UMS-3076F5A5AD54/data" }
GET /data     → { telemetry fields, null for uncalibrated energy fields }
```

---

## Tests Run

| Test | Command | Result |
|------|---------|--------|
| Lint | `npm run lint` | ✅ 0 errors, 0 warnings |
| Playwright (74 original) | `npx playwright test` | ✅ 74 / 74 passed |
| Playwright (visual) | `npx playwright test e2e/visual-screenshots.spec.ts` | ✅ 19 / 19 passed |
| **Total** | | **✅ 93 / 93 passed** |

---

## Screenshot Paths

Desktop (1440×900): `qa/screenshots/web/desktop/` — 13 screenshots  
Mobile (390×844): `qa/screenshots/web/mobile/` — 6 screenshots  
Board: **not taken** — device unreachable from this machine.

Screenshots are in `.gitignore` (local review only).

---

## Remaining Non-Code Tasks

| # | Item | Owner |
|---|------|-------|
| R-1 | Live device credential fix at `http://192.168.0.100/` | On-site engineer |
| R-2 | `npm run db:cleanup-test:dry` → review → `npm run db:cleanup-test` | Dev team |
| R-3 | Merge `energy-analyzer-integration` → `master`, tag `v2.1.0` | Dev team |
| R-4 | Config push via MQTT (firmware future) | Future sprint |
| R-5 | Command subscription (firmware future) | Future sprint |
| R-6 | Active power / PF / kWh calibration (hardware future) | Future hardware |

---

## Ship Decision

**PASS WITH CONDITIONS**

Code and automated tests are clean. All P0 blockers resolved. Lint passes. 93/93 tests pass.

Remaining conditions before tagging `v2.1.0`:
1. On-site engineer must configure live device credentials (R-1)
2. DB cleanup script must be run on production DB (R-2)
3. Board must be verified online in dashboard after credential fix
