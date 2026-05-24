# 01 — Route and Feature Inventory

**Audit date:** 2026-05-21

---

## Routes

| Route | File | Purpose | Auth required | Data source | Status | Notes |
|-------|------|---------|--------------|-------------|--------|-------|
| /login | src/app/login/page.tsx | Username + password form | No | N/A | PASS | Server component, form POST to /api/login |
| / | src/app/page.tsx | Fleet dashboard — live telemetry table | Yes (proxy.ts) | /api/telemetry/latest (5s poll) | PASS | No IP column in table; no board portal link |
| /ups/[id] | src/app/ups/[id]/page.tsx | UPS detail — metrics, device info, alarms, commissioning | Yes | /api/ups/[id] (10s poll) | PASS | IP shown as text; no clickable board portal link |
| /alarms | src/app/alarms/page.tsx | Alarm management — list, filter, acknowledge | Yes | /api/alarms (15s poll) | PASS | Ack with comment works; table overflows on mobile |
| /admin/inventory | src/app/admin/inventory/page.tsx | Add/edit/delete UPS inventory records | Yes | /api/inventory | PASS | No deactivate/soft-delete; hard delete only |
| /admin/settings | src/app/admin/settings/page.tsx | Data retention, offline threshold | Yes | /api/settings | PASS | No manufacturer feature flags; no access control |
| /admin/alarm-rules | src/app/admin/alarm-rules/page.tsx | Alarm threshold rule management | Yes | /api/alarm-rules | PARTIAL | UPS-scope rules require internal DB cuid — UX broken |
| /admin/users | MISSING | User management page | — | — | MISSING | User model exists in schema; no UI |
| /admin/boards | MISSING | Board management / OTA / portal links | — | — | MISSING | No dedicated board management page |

## API Routes

| API Route | File | Method(s) | Purpose | Auth | Status | Notes |
|-----------|------|-----------|---------|------|--------|-------|
| /api/health | health/route.ts | GET | DB + uptime health check | No | PASS | Returns {status,db,uptime,dbEnabled} |
| /api/login | login/route.ts | POST | Username/password auth, sets session cookie | No | PASS | bcrypt hash or plain-text dev fallback |
| /api/logout | logout/route.ts | POST | Clear session cookie | No | PASS | |
| /api/devices | devices/route.ts | GET | List all devices with online/IP/firmware | No | PASS | IP available here but not shown in fleet table |
| /api/devices/[deviceId] | devices/[deviceId]/route.ts | GET | Single device detail | No | PASS | |
| /api/telemetry/latest | telemetry/latest/route.ts | GET | Latest reading per device | No | PASS | Returns raw MQTT values |
| /api/telemetry/history | telemetry/history/route.ts | GET | Raw or rollup history for a device | No | PASS | Returns up to 500 raw rows |
| /api/alarms | alarms/route.ts | GET | List alarms with filter (state, limit) | No | PASS | |
| /api/alarms/[id]/ack | alarms/[id]/ack/route.ts | POST | Acknowledge alarm with comment | No | PASS | acknowledgedBy is hardcoded "operator" in UI |
| /api/alarm-rules | alarm-rules/route.ts | GET, POST | List/create alarm rules | No | PASS | |
| /api/alarm-rules/[id] | alarm-rules/[id]/route.ts | GET, PUT, DELETE | Single rule CRUD | No | PASS | |
| /api/inventory | inventory/route.ts | GET, POST, PUT, DELETE | UPS inventory CRUD | No | PASS | GET/POST/DELETE functional; PUT exists in code |
| /api/settings | settings/route.ts | GET, PUT | System retention/threshold settings | No | PASS | |
| /api/ups | ups/route.ts | GET, POST | UPS unit list/create | No | PASS | |
| /api/ups/[id] | ups/[id]/route.ts | GET, PATCH | UPS detail including device, telemetry, alarms | No | PASS | |
| /api/users | MISSING | User management | — | MISSING | MISSING | Schema has User model; no API route |
| /api/calibration | MISSING | Calibration profile read/write | — | MISSING | MISSING | CalibrationProfile model in schema; no API |
| /api/ota | MISSING | OTA firmware trigger | — | MISSING | MISSING | No OTA API route |

**Note on auth:** API routes currently have NO per-route auth check. The proxy.ts middleware protects all non-/login, non-/api/health routes at the edge. However, the /api/* routes themselves do not validate the session cookie — they can be called without auth if the middleware is bypassed. This is LOW risk for LAN-only deployment but should be noted.

---

## Feature Inventory

| Feature | UI exists | Backend exists | DB exists | Tested | Status | Gap |
|---------|-----------|---------------|-----------|--------|--------|-----|
| Fleet dashboard | YES | YES | YES | YES | PASS | No board IP column or portal button |
| UPS detail page | YES | YES | YES | YES | PASS | No board portal button; no trend chart |
| Inventory CRUD | YES | YES | YES | YES | PASS | Hard delete only; no deactivate |
| Alarm list | YES | YES | YES | YES | PASS | |
| Alarm acknowledge | YES | YES | YES | YES | PASS | acknowledgedBy hardcoded as "operator" |
| Alarm rule create/edit | YES | YES | YES | YES | PARTIAL | UPS-scope requires DB cuid; no rule edit (only create+delete) |
| System settings | YES | YES | YES | YES | PASS | Retention + offline threshold only |
| Board IP display | PARTIAL | YES | YES | YES | PARTIAL | Shows in UPS detail device info; NOT in fleet table; not clickable |
| Board portal open button | NO | NO | N/A | NO | MISSING | No link to http://\<ip\>/ anywhere |
| Board config portal link | NO | NO | N/A | NO | MISSING | No link to http://\<ip\>/setup |
| Board OTA link | NO | NO | N/A | NO | MISSING | No OTA trigger from dashboard |
| WiFi setup (board-side) | ESP32 only | N/A | N/A | YES | PARTIAL | Board hosts captive portal; no dashboard integration |
| Static IP setup (board-side) | ESP32 only | N/A | N/A | YES | PARTIAL | Board-side only |
| MQTT setup (board-side) | ESP32 only | N/A | N/A | YES | PARTIAL | Commissioning portal on ESP32; not from dashboard |
| Firmware OTA (board-side) | ESP32 only | N/A | N/A | YES | PARTIAL | Board supports OTA upload via HTTP; no dashboard trigger |
| Calibration | ESP32 NVS only | NO | YES (schema) | NO | MISSING | CalibrationProfile model exists; no UI or API |
| User management | NO | NO | YES (schema) | NO | MISSING | User model in schema; no CRUD UI or API |
| Login/auth | YES | YES | NO (env-only) | YES | PARTIAL | Single user via env vars; DB User model unused |
| Access control/roles | NO | NO | PARTIAL | NO | MISSING | role field in User model; no enforcement anywhere |
| Manufacturer feature enable/disable | NO | NO | NO | NO | MISSING | ManufacturerSettings section on fleet page is only retention settings |
| History/trend chart | NO (removed) | YES (API) | YES | PARTIAL | MISSING | API returns history data; no frontend chart |
| 1-minute rollup | NO (API only) | YES | YES | YES | PARTIAL | Rollup worker runs; no chart in UI |
| Backup | YES (script) | YES | YES | YES | PASS | deployment/scripts/backup.sh confirmed working |
| Restore | YES (script) | YES | YES | NOT END-TO-END | PARTIAL | Restore script exists; not tested on fresh DB |
| Docker deployment | NO | YES (files) | YES | NOT TESTED | BLOCKED | Docker not installed |
| LAN-only monitoring | YES (design) | YES | YES | PARTIAL | PARTIAL | No internet required for data; firmware MQTT uses LAN IP |
| Measurement limitations display | YES | N/A | N/A | YES | PASS | Settings page and UPS detail show "not supported" for W/kWh/PF |
| volt_dc alarm calibration | BROKEN | BROKEN | N/A | NO | BROKEN | Alarm compares raw ADC value (556.7) against V thresholds (57.024V) — spurious critical alarms |
