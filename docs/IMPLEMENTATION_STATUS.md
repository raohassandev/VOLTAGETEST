# Implementation Status — UPS Monitoring System

**Branch:** `professionalization-plan`
**Last updated:** 2026-05-20

---

## Milestone 2 + 3 — Completed

### A. PostgreSQL Persistence (Prisma)

| Item | Status |
|------|--------|
| Prisma schema with all required tables | ✅ Done |
| `prisma/schema.prisma` | ✅ `web-dashboard/prisma/schema.prisma` |
| `src/lib/db.ts` singleton | ✅ Done |
| `prisma generate` passes | ✅ Verified |
| Migration deploy on Docker startup | ✅ In Dockerfile CMD |

Tables created:
- `User`, `Session` (future multi-user)
- `Site`, `UpsUnit`, `Device`, `CalibrationProfile`
- `AlarmRule`, `TelemetryRaw`, `TelemetryLatest`
- `Alarm`, `AlarmEvent`, `SystemSettings`, `AuditLog`

### B. DB-backed APIs

| Endpoint | Status |
|----------|--------|
| `GET/PUT/POST/DELETE /api/inventory` | ✅ DB-backed with JSON fallback |
| `GET/PUT /api/settings` | ✅ DB-backed with JSON fallback |
| `GET /api/telemetry/latest` | ✅ DB-backed with JSON fallback |
| `GET /api/telemetry/history` | ✅ DB-backed with JSON fallback |
| `GET /api/devices` | ✅ New |
| `GET /api/devices/:deviceId` | ✅ New |
| `GET /api/ups` | ✅ New |
| `GET/PATCH /api/ups/:id` | ✅ New |
| `GET /api/alarms` | ✅ New |
| `POST /api/alarms/:id/ack` | ✅ New |
| `GET /api/health` | ✅ New |

All DB-backed routes fall back to JSON file storage if `DATABASE_URL` is not set.

### C. MQTT Worker

| Item | Status |
|------|--------|
| Separate worker process | ✅ `web-dashboard/worker/mqtt-worker.ts` |
| MQTT subscribe + reconnect | ✅ Done |
| Telemetry persist to `telemetry_raw` | ✅ Done |
| Upsert `telemetry_latest` | ✅ Done |
| Update `devices` (ip, firmware, online, lastSeenAt) | ✅ Done |
| Run alarm evaluation per message | ✅ Done |
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
| `/login` | ✅ Unchanged — working |
| `/` fleet dashboard | ✅ Improved — search, load%, offline indicator, nav links |
| `/ups/[id]` UPS detail | ✅ New — live telemetry, alarms, history, notes |
| `/alarms` alarm management | ✅ New — list, filter, ack with comment |
| `/admin/inventory` | ✅ New — full CRUD |
| `/admin/settings` | ✅ New — retention + offline threshold |

UPS detail page shows:
- Input/output/battery voltage, currents, apparent power VA
- Load percentage (sOutVa / capacityVa × 100)
- Online/offline status, RSSI, firmware, last seen
- Active alarms with acknowledge button
- Alarm history table (50 rows)
- Maintenance notes (saved via PATCH /api/ups/:id)

kW / kWh / PF shown as "not supported" — not computed from firmware data.

### F. Auth

| Item | Status |
|------|--------|
| Bcrypt password hash support (`UPS_AUTH_PASSWORD_HASH`) | ✅ Done |
| Plain-text fallback for development | ✅ Done |
| Production blocks login if no token/password set | ✅ Done |
| Remove hardcoded `admin12345` in production | ✅ Done |
| HTTP-only session cookie | ✅ Already was, unchanged |
| Document env vars | ✅ `.env.example` updated |

### G. Deployment

| Item | Status |
|------|--------|
| `docker-compose.yml` with postgres, mosquitto, web, worker | ✅ Done |
| Worker `Dockerfile.worker` | ✅ Done |
| Web `Dockerfile` with migration on startup | ✅ Done |
| `.env.example` with all new vars | ✅ Done |
| `deployment/scripts/backup.sh` | ✅ Done |
| `deployment/scripts/restore.sh` | ✅ Done |
| `deployment/scripts/health-check.sh` | ✅ Done |

### H. Firmware v0.4.0

| Change | Status |
|--------|--------|
| `MQTT_PUBLISH_MS` default changed to `5000ms` (from 500ms) | ✅ Done |
| `seq` counter added to payload | ✅ Done |
| `free_heap` added to payload | ✅ Done |
| `mac` address added to payload | ✅ Done |
| `reset_reason` added to payload | ✅ Done |
| `esp_system.h` include added | ✅ Done |
| Existing payload keys unchanged (backward-compatible) | ✅ Verified |
| `/data` and `/update` endpoints unchanged | ✅ Verified |

---

## Pending (Future Milestones)

- Telemetry rollup (1-minute aggregation into `telemetry_1m`)
- Automatic data retention pruning (raw / rollup / alarm)
- Multi-user DB auth with role-based access
- Fleet OTA management from dashboard
- Active power (W), power factor, energy (kWh) — requires waveform-sampling firmware
- Email/SMS/WhatsApp alarm notifications
- Production TLS / nginx reverse proxy
- Firmware Last Will / retained status topic (requires MQTT library upgrade)
