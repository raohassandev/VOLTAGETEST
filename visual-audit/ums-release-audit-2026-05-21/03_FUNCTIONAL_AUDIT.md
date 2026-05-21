# 03 — Functional Audit

**Audit date:** 2026-05-21
**Test environment:** Local dev — dashboard on localhost:3000, PostgreSQL localhost:5432, Mosquitto localhost:1883, board DEV-COM11-TEST at 192.168.0.110

---

## A — Login

| Test ID | Feature | Steps | Expected | Actual | Status | Evidence |
|---------|---------|-------|----------|--------|--------|---------|
| A1 | Valid login | POST /api/login username=admin password=UMS@Local2026! | Redirect to /, session cookie set | Cookie set, dashboard loads | PASS | Screenshot: fleet-dashboard__*.png |
| A2 | Invalid login | POST /api/login with wrong password | Redirect /login?error=1 | Error banner shows "Invalid username or password." | PASS | Screenshot: login__*.png |
| A3 | Logout | Form POST to /api/logout | Cookie cleared, redirect to /login | Redirect to /login | PASS | Logout button in header |
| A4 | Protected route redirect | GET / without session cookie | Redirect to /login | Proxy.ts redirects to /login?next=/ | PASS | proxy.ts middleware confirmed in build output |
| A5 | API routes without auth | GET /api/devices (no cookie) | Should return 200 (unprotected at API level) | 200 OK returned | PARTIAL | API routes have NO per-route auth check; middleware protects page routes only |

---

## B — Fleet Dashboard

| Test ID | Feature | Steps | Expected | Actual | Status | Evidence |
|---------|---------|-------|----------|--------|--------|---------|
| B1 | Loads without browser MQTT | Open / after browser MQTT removal | Fleet data from /api/telemetry/latest | API data shown, 2 devices in table | PASS | fleet-dashboard__*.png |
| B2 | Shows live telemetry from API | Check fleet table values vs /api/telemetry/latest | Matching volt_in, volt_out, etc. | Match confirmed: DEV-COM11-TEST volt_in 254.4V | PASS | API probe + screenshot |
| B3 | No fake 0 V cards | Open fleet page | No "0 V" MiniGauge cards | MiniGauge removed; no 0V cards | PASS | Screenshot |
| B4 | Online/offline display | DEV-COM11-TEST online, DEV-LOCAL-01 offline | Correct status per row | PASS — "normal" green / "offline" grey | PASS | fleet-dashboard__*.png |
| B5 | Device IP in fleet table | Check fleet table columns | IP column expected | **IP column NOT present in fleet table** | MISSING | page.tsx FleetTable: no ip column; device IP available in /api/devices but not displayed |
| B6 | Board IP clickable | Click IP in fleet row | Open board portal | **Not implemented** | MISSING | No board portal button anywhere on fleet page |
| B7 | Alarm badge counts | Check header alarm count vs /api/alarms active count | Match | 10 active alarms in badge, consistent with API | PASS | |
| B8 | API status badge | Check header badge | "API online" green badge | Shows "API online" (emerald) | PASS | fleet-dashboard__*.png |

---

## C — UPS Detail Page

| Test ID | Feature | Steps | Expected | Actual | Status | Evidence |
|---------|---------|-------|----------|--------|--------|---------|
| C1 | Opens from fleet row | Click UPS-COM11-TEST in fleet table | /ups/UPS-COM11-TEST loads | Loads correctly | PASS | ups-detail-live__*.png |
| C2 | Shows live metric values | Check metric cards | Matches /api/ups/UPS-COM11-TEST telemetry | Values match API | PASS | ups-detail-live__*.png |
| C3 | Board IP shown | Check Device info section | IP visible | "IP Address: 192.168.0.110" shown as plain text | PARTIAL | No link/button to open 192.168.0.110 |
| C4 | Board portal button | Look for "Open board portal" link | Clickable http://192.168.0.110 link | **Not present** | MISSING | No board portal or config link |
| C5 | Firmware/MAC/RSSI shown | Device info section | firmware 0.5.2, MAC, RSSI -54 dBm | All shown correctly | PASS | ups-detail-live__*.png |
| C6 | Active alarms shown | UPS-COM11-TEST detail | Active alarms listed with Ack button | Alarms shown; ack button functional | PASS | |
| C7 | Alarm history table | Bottom of detail page | History rows visible | Alarm history table present (last 50) | PASS | |
| C8 | History/trend chart | Check for trend chart | Chart showing voltage over time | **No trend chart** — removed, no replacement | MISSING | TrendChart was removed; no history visualization |
| C9 | Measurement limitation clarity | "Not supported" fields | W, kWh, PF cards show "— (not supported)" | Shown correctly in 3rd row of metric cards | PASS | ups-detail-live__*.png |
| C10 | Offline device detail | Open /ups/UPSMON-01 | Offline badge, null telemetry handled | Offline badge shown, metric cards show "--" | PASS | ups-detail-offline__*.png |
| C11 | Not found error | Open /ups/DOES-NOT-EXIST | Error message shown | "UPS not found." message shown | PASS | ups-notfound__*.png |

---

## D — Inventory

| Test ID | Feature | Steps | Expected | Actual | Status | Evidence |
|---------|---------|-------|----------|--------|--------|---------|
| D1 | Create UPS | Fill form, click Save | UPS appears in table | New row added to table | PASS | Tested via UI |
| D2 | Edit UPS | Click Edit, modify, Save | Row updated | Works — Edit fills form, Save updates | PASS | |
| D3 | Map Device ID | Set deviceId field to existing device ID | Device linked to UPS | Accepted; /api/ups/[id] returns linked device | PASS | |
| D4 | Delete UPS | Click trash icon | Row removed | Removes from table; hard delete via /api/inventory?upsId=... | PARTIAL | No deactivate option; hard delete with no confirmation dialog |
| D5 | Validation errors | Save with empty UPS ID | Error or disabled button | Save button disabled when upsId is empty | PASS | |
| D6 | UPS ID link to detail | Click UPS ID in table | Opens /ups/[upsId] | Navigates to UPS detail | PASS | |

---

## E — Alarm Rules

| Test ID | Feature | Steps | Expected | Actual | Status | Evidence |
|---------|---------|-------|----------|--------|--------|---------|
| E1 | Create global rule | Add rule for volt_in, scope=global | Rule saved, appears in table | PASS | PASS | |
| E2 | Create high threshold | Add highWarning=245, highCritical=255 | Values stored | Stored correctly in DB | PASS | |
| E3 | Disable rule | Click enabled toggle | Rule greyed out | Toggle works; row opacity reduced | PASS | |
| E4 | Delete rule | Click trash icon | Rule removed | Window.confirm then DELETE /api/alarm-rules/[id] | PASS | |
| E5 | UPS-scope rule requires DB cuid | Select scope=ups | "UPS Unit ID (DB cuid)" input | User must enter internal cuid (e.g. cmpfc1po2001311w6r6dtc2mq) — **not the UPS ID string** | BROKEN | Users have no way to know the cuid; UPS ID "UPS-COM11-TEST" is NOT accepted |
| E6 | No inline rule edit | Try editing an existing rule | Edit form loads with current values | **No edit button on existing rules** — only delete. Must delete and re-create | PARTIAL | Only create + delete; no update flow |

---

## F — Alarms

| Test ID | Feature | Steps | Expected | Actual | Status | Evidence |
|---------|---------|-------|----------|--------|--------|---------|
| F1 | Active alarms visible | Open /alarms, filter=active | Active alarms listed | 10 active alarms listed | PASS | alarms__*.png |
| F2 | Acknowledge alarm | Click Ack, Confirm | acknowledgedAt set | Ack flow works; comment optional | PASS | Tested via UI |
| F3 | volt_dc alarm accuracy | volt_dc alarm message | "Battery Voltage critically high: 24.6 (limit 57.024)" | **ACTUAL: "556.7 (limit 57.024)"** — raw ADC value compared to voltage threshold | BROKEN | alarm-engine.ts compares snap.voltDc (raw) against batteryNominalV-derived V thresholds; no calibration applied |
| F4 | Alarm clear | Restore normal value | clearedAt set | Tested via DEV-LOCAL-01 going offline/online cycle | PASS | |
| F5 | Offline alarm | Device stops publishing for 60s | offline alarm created | Confirmed via DEV-LOCAL-01: online=false, offline alarm created | PASS | /api/devices shows online:false |
| F6 | Filter by cleared | Click "cleared" button | Shows only cleared alarms | Filter change reloads from API with ?state=cleared | PASS | |
| F7 | Duplicate active alarms | Multiple volt_dc alarms with same firstSeenAt | Should have one alarm per metric per device | **4 separate active alarms for volt_dc on same device** — DB has duplicate rows | ISSUE | Likely created during burst telemetry before debounce map populated |

---

## G — Settings

| Test ID | Feature | Steps | Expected | Actual | Status | Evidence |
|---------|---------|-------|----------|--------|--------|---------|
| G1 | Retention settings save | Change rawRetentionDays, click Save | Confirmed "Settings saved." | PASS | PASS | settings__*.png |
| G2 | Offline threshold saves | Change offlineThresholdSecs, click Save | Worker picks up new value | UI saves via /api/settings PUT | PASS | Note: worker reads from DB on each MQTT message |
| G3 | Manufacturer feature flags | Look for enable/disable toggles | Feature on/off per operator | **Not present** — no feature flag system | MISSING | ManufacturerSettings on fleet page is only retention fields |
| G4 | Access control settings | Look for role/permission settings | User role management | **Not present** | MISSING | |

---

## H — History / Rollup

| Test ID | Feature | Steps | Expected | Actual | Status | Evidence |
|---------|---------|-------|----------|--------|--------|---------|
| H1 | History API short range | GET /api/telemetry/history?deviceId=DEV-COM11-TEST&from=...&to=... | Raw rows returned | 500 rows returned in 3h window | PASS | Probed via PowerShell |
| H2 | History API content | Check returned fields | volt_in, volt_out, etc. | All fields present including firmware, rssi, ip | PASS | |
| H3 | Frontend history chart | Check /ups/[id] for trend chart | Chart using /api/telemetry/history | **No chart present** — TrendChart was removed, not replaced | MISSING | |
| H4 | 1m rollup worker | Check Telemetry1m rows | Rolling up every minute | 161 buckets confirmed during burn-in | PASS | AGENT_STATUS.md burn-in evidence |

---

## I — LAN-only monitoring

| Test ID | Feature | Steps | Expected | Actual | Status | Evidence |
|---------|---------|-------|----------|--------|--------|---------|
| I1 | Dashboard without internet | Check fonts/CDN dependencies | No external resources required | Google Fonts removed; system font stack used | PASS | layout.tsx |
| I2 | Worker without internet | MQTT worker uses MQTT_BROKER_URL | Local Mosquitto only | localhost:1883 in .env; no external MQTT | PASS | .env + worker |
| I3 | Board MQTT target | Board sends to server LAN IP | Board uses MQTT broker LAN IP | Board configured via commissioning portal (192.168.x.x) | PASS | Commissioning portal on board |
| I4 | Full LAN install instructions | Documentation exists | Clear instructions for local-only install | DEPLOYMENT_GUIDE.md exists | PARTIAL | Docs assume Docker; no bare-metal LAN setup guide |

---

## J — Docker

| Test ID | Feature | Steps | Expected | Actual | Status | Evidence |
|---------|---------|-------|----------|--------|--------|---------|
| J1 | Docker compose up | docker compose -f deployment/docker-compose.yml up -d --build | All 4 services start | **NOT TESTED** | BLOCKED | Docker not installed on this machine |
| J2 | MQTT through Docker | Publish via Docker Mosquitto | Worker ingests, appears in /api/telemetry/latest | **NOT TESTED** | BLOCKED | |
| J3 | Migration on startup | Check web container logs | prisma migrate deploy succeeds | **NOT TESTED** | BLOCKED | |
