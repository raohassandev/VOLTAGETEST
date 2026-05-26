# 05 — Code Architecture Audit

**Audit date:** 2026-05-21

---

## File-by-file Summary

### Frontend Pages

| Area | File | What it does | Main risks | Status |
|------|------|-------------|-----------|--------|
| Login | src/app/login/page.tsx | Server component; form POST to /api/login | Plain HTML form; no CSRF protection | ACCEPTABLE |
| Fleet dashboard | src/app/page.tsx | Client component; useTelemetry hook; fleet table + alarm panel + manufacturer settings | ManufacturerSettings label confusing; no board IP link | PARTIAL |
| UPS detail | src/app/ups/[id]/page.tsx | Client component; 10s poll /api/ups/[id]; metric cards, device info, alarm section | No board portal link; no trend chart | PARTIAL |
| Alarms | src/app/alarms/page.tsx | Client component; 15s poll /api/alarms; filter + ack flow | Duplicate alarm rows (DB issue); ack uses hardcoded "operator" | PARTIAL |
| Inventory | src/app/admin/inventory/page.tsx | Client component; POST/DELETE /api/inventory | No delete confirmation; no deactivate | PARTIAL |
| Settings | src/app/admin/settings/page.tsx | Client component; GET/PUT /api/settings | Functional; limited to retention + offline threshold | ACCEPTABLE |
| Alarm rules | src/app/admin/alarm-rules/page.tsx | Client component; GET/POST/DELETE /api/alarm-rules | UPS-scope requires DB cuid — UX broken; no edit action | BROKEN |
| Layout | src/app/layout.tsx | Root layout; system font stack (Google Fonts removed) | No dynamic title per page | ACCEPTABLE |

### Library / Hooks

| Area | File | What it does | Main risks | Status |
|------|------|-------------|-----------|--------|
| Telemetry hook | src/lib/telemetry.ts | useTelemetry: polls /api/telemetry/latest, /api/health, /api/inventory, /api/settings; returns fleet state | Browser MQTT removed; localStorage for config | PASS |
| Auth | src/lib/auth.ts | bcrypt verify for Node runtime; edge-safe verify for middleware | Dev plain-text password fallback; correct | ACCEPTABLE |
| DB | src/lib/db.ts | Prisma client singleton | Falls back to no-DB mode if DATABASE_URL absent | ACCEPTABLE |
| Alarm engine | src/lib/alarm-engine.ts | resolveThresholds → evaluateAlarms → DB upsert | **volt_dc raw ADC value compared against V thresholds** — calibration not applied; in-memory debounceMap lost on worker restart | BROKEN |
| Telemetry types | src/lib/telemetry-types.ts | RawTelemetry type; normalizeTelemetry; initialTelemetry | Stable | PASS |
| MQTT ingestion | src/lib/mqtt-ingestion.ts | Browser-side MQTT (admin config page) — NOT used in worker | Unused legacy artifact for browser-side config | LOW RISK |

### API Routes

| Area | File | What it does | Main risks | Status |
|------|------|-------------|-----------|--------|
| health | /api/health/route.ts | DB liveness check | No auth required — correct | PASS |
| login | /api/login/route.ts | bcrypt verify, set session cookie | Cookie uses UPS_AUTH_TOKEN; correct | PASS |
| logout | /api/logout/route.ts | Clear session cookie | Correct | PASS |
| devices | /api/devices/route.ts | List all Device rows with UpsUnit join | No auth check at route level | ACCEPTABLE |
| devices/[id] | /api/devices/[deviceId]/route.ts | Single device detail | No auth check at route level | ACCEPTABLE |
| telemetry/latest | /api/telemetry/latest/route.ts | TelemetryLatest join Device; returns flat record per device | No auth check; limited to 50 devices | ACCEPTABLE |
| telemetry/history | /api/telemetry/history/route.ts | TelemetryRaw or Telemetry1m based on range | Hardcoded 500-row raw limit; no pagination | ACCEPTABLE |
| alarms | /api/alarms/route.ts | Alarm list with state filter; joins UpsUnit for location | Hardcoded 200 limit | ACCEPTABLE |
| alarms/[id]/ack | /api/alarms/[id]/ack/route.ts | Set acknowledgedAt, acknowledgedBy, comment | acknowledgedBy comes from request body — caller must supply username | PARTIAL |
| alarm-rules | /api/alarm-rules/route.ts | GET all, POST new rule | No validation that upsUnitId is a valid cuid vs upsId string | BROKEN (UX) |
| alarm-rules/[id] | /api/alarm-rules/[id]/route.ts | GET, PUT, DELETE single rule | Correct | PASS |
| inventory | /api/inventory/route.ts | GET/POST/DELETE UPS inventory | Uses UpsUnit model in DB; no deactivate | ACCEPTABLE |
| settings | /api/settings/route.ts | GET/PUT SystemSettings + offlineThresholdSecs | Correct | PASS |
| ups | /api/ups/route.ts | GET list, POST create UPS unit | Correct | PASS |
| ups/[id] | /api/ups/[id]/route.ts | GET full UPS detail including device, telemetry, alarms, commissioning, PATCH notes | Correct; pInW/pfIn/eInKwh returned as null | PASS |

### Workers

| Area | File | What it does | Main risks | Status |
|------|------|-------------|-----------|--------|
| MQTT worker | worker/mqtt-worker.ts | Subscribes MQTT, inserts TelemetryRaw, updates TelemetryLatest, evaluateAlarms | In-memory debounceMap reset on restart (lost debounce state); single process | PARTIAL |
| Rollup worker | worker/rollup.ts | Inserts Telemetry1m buckets every minute | Timezone fixed (commit 0602b85); correct | PASS |

### DB / Deployment

| Area | File | What it does | Main risks | Status |
|------|------|-------------|-----------|--------|
| Schema | prisma/schema.prisma | 12 models; User, CalibrationProfile defined but no API | CalibrationProfile model unused at API level | PARTIAL |
| Migrations | prisma/migrations/ | Migration files for all schema changes | Correct | PASS |
| docker-compose.yml | deployment/docker-compose.yml | 4 services: postgres, mosquitto, web, mqtt-worker | Not tested end-to-end | UNTESTED |
| Mosquitto config | deployment/mosquitto/ | ACL, dev conf, setup script | Correct; passwords file must be generated before use | PASS |
| backup.sh | deployment/scripts/backup.sh | pg_dump via PGPASSWORD env | Confirmed working (commit 9bbc9b7) | PASS |
| restore.sh | deployment/scripts/restore.sh | DROP SCHEMA + psql restore | Not end-to-end tested | PARTIAL |
| Dockerfile | web-dashboard/Dockerfile | Next.js app container; `prisma migrate deploy && npm start` | Migration failure now stops startup (fixed) | PASS |
| Dockerfile.worker | web-dashboard/Dockerfile.worker | Worker container | Not tested | UNTESTED |

### Firmware

| Area | File | What it does | Main risks | Status |
|------|------|-------------|-----------|--------|
| ESP32 firmware | firmware/ups_monitor/ups_monitor.ino | WiFi STA/AP, MQTT publish, commissioning portal, NVS calibration | Sends raw ADC values — alarm engine does not calibrate | PARTIAL |

### Docs / Release

| Area | File | What it does | Main risks | Status |
|------|------|-------------|-----------|--------|
| AGENT_STATUS.md | root | Agent work tracking | Current | PASS |
| SHIP_BLOCKERS.md | root | Blocker evidence log | Current | PASS |
| docs/CALIBRATION_GUIDE.md | docs/ | Per-channel calibration procedure | Good content | PASS |
| docs/DEPLOYMENT_GUIDE.md | docs/ | Docker deployment procedure | Docker not tested | PARTIAL |
| release/* | release/ | Release notes, operator guide, installer checklist | Present | PASS |

---

## Duplicate / Dead Code

| Item | Location | Issue |
|------|----------|-------|
| `src/lib/mqtt-ingestion.ts` | web-dashboard/src/lib/ | Browser-side MQTT ingestion; was used by old config page; now unused by any page. Can be removed. |
| `rowsForTelemetry`, `alarmsForRows` | telemetry.ts | Still used by API polling in useTelemetry; valid |
| `readStoredConfig`, `readStoredInventory` | telemetry.ts | Config saved to localStorage; still used but localStorage config has no brokerUrl field any more — old stored configs with brokerUrl are silently ignored |
| `ManufacturerSettings` component | page.tsx | Duplicates /admin/settings functionality; confusing label |
| `User` model | schema.prisma | Defined with role field; no migration to seed or manage users; entire auth bypasses DB |
| `CalibrationProfile` model | schema.prisma | Defined; migration exists; no API route, no UI, no worker usage |

---

## Hardcoded / Default Secret Risks

| Item | Location | Risk | Mitigation |
|------|----------|------|-----------|
| `UPS_AUTH_TOKEN=local-dev-token-change-later` | .env (local dev) | Must not reach production | instrumentation.ts throws if placeholder used |
| `POSTGRES_PASSWORD=change-this-db-password` | docker-compose.yml fallback | Container starts with default password | instrumentation.ts throws if placeholder used |
| `MQTT_PASSWORD=change-this-mqtt-password` | docker-compose.yml fallback | Mosquitto password not set up | instrumentation.ts throws if placeholder used |
| `acknowledgedBy: "operator"` | alarms page.tsx L57 | Not a secret but loss of audit identity | Use session username |
| `ALLOW_DEV_AUTH=true` allowed in .env | auth.ts | Auth bypass in dev | instrumentation.ts logs FATAL if used in production |

---

## Missing Error Handling

| Location | Issue |
|----------|-------|
| alarm-engine.ts debounceMap | In-memory; wiped on worker restart. Alarms may re-debounce incorrectly after restart |
| /api/alarms route | Limit hardcoded to 200; no cursor pagination |
| /api/telemetry/history | Limit hardcoded to 500 raw rows; no range check that produces gigantic queries |
| worker/mqtt-worker.ts | No reconnect-storm protection beyond mqtt library defaults |
| Inventory delete | DELETE /api/inventory deletes UPS unit even if it has active alarms |

---

## Code That Must Be Addressed Before Demo

1. **alarm-engine.ts** — volt_dc raw ADC compared to V thresholds. Alarm message values are wrong.
2. **alarm-rules/page.tsx** — UPS-scope requires DB cuid. Users cannot create UPS-scoped rules.
3. **page.tsx FleetTable** — No board IP column or portal link.
4. **ups/[id]/page.tsx** — No "Open board portal" button for the IP address.

## Code That Can Wait Until After Demo

1. User management UI and DB-backed auth
2. CalibrationProfile API and UI
3. Trend chart on UPS detail
4. Alarm rule inline edit
5. Pagination for history and alarms APIs
6. CSRF protection on login form
7. Per-route API auth checks
