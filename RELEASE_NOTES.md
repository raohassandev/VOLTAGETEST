# UMS Release Candidate v0.2.0

**Branch:** `local-first-architecture`  
**Certification commit:** `f3c1836`  
**Date:** 2026-05-23  
**Status:** `UMS Docker Runtime Certification: PASSED`

---

## What Was Certified

All four Docker containers start healthy from a clean `docker compose up`:

| Service      | Image                   | Status   |
|--------------|-------------------------|----------|
| postgres     | postgres:16-alpine      | healthy  |
| mosquitto    | eclipse-mosquitto:2     | up       |
| mqtt-worker  | deployment-mqtt-worker  | up       |
| web          | deployment-web          | healthy  |

### Certification Test Results

| Test                                  | Result |
|---------------------------------------|--------|
| `/api/health` returns `{status:ok}`   | ✓ PASS |
| `/api/system/health` (admin auth)     | ✓ PASS |
| `/api/system/health` (unauth → 401)   | ✓ PASS |
| `POST /api/login` → 303 + cookies     | ✓ PASS |
| Prisma migrations run on startup      | ✓ PASS |
| MQTT ingest: telemetry stored in DB   | ✓ PASS |
| Alarm engine fires on bad metrics     | ✓ PASS |
| Device marked online after telemetry  | ✓ PASS |
| Web health check passes (127.0.0.1)   | ✓ PASS |

---

## Docker Fixes Included (f3c1836)

1. **Prisma CLI `__dirname` bug** — Docker `COPY` dereferences symlinks, so
   `node_modules/.bin/prisma` became a plain JS file with `__dirname = .bin/`
   instead of `prisma/build/`. Fixed by invoking Prisma directly:
   `node node_modules/prisma/build/index.js migrate deploy`.

2. **OpenSSL missing on Alpine** — `apk add --no-cache openssl` added to
   both `Dockerfile` (runner stage) and `Dockerfile.worker`.

3. **Next.js standalone binding** — `ENV HOSTNAME=0.0.0.0` added so the
   server binds to all interfaces, not just the container's eth0 IP.

4. **Health check DNS** — `localhost` does not resolve in Alpine containers;
   changed to `127.0.0.1` in `docker-compose.yml`.

5. **Prisma binary target** — Added `linux-musl-openssl-3.0.x` to
   `binaryTargets` in `schema.prisma` to match Alpine+OpenSSL 3 runtime.

---

## Known Limitations (Not Blockers for This RC)

### Firmware Support
- Current firmware (v0.5.2) sends UPS V/A/VA monitoring fields:
  `volt_ac`, `volt_dc`, `load_pct`, `batt_pct`, `temp_c`
- Full energy analyzer fields (`p_in_w`, `p_out_w`, `pf_in`, `pf_out`,
  `e_in_kwh`, `e_out_kwh`, `freq_in`, `freq_out`) are **schema-ready**
  but not yet emitted by firmware

### Commands (UI Disabled)
- Dashboard command buttons (reboot, reset, OTA) are **intentionally disabled**
  in the UI pending firmware-side command handler implementation
- ACL is pre-wired: `dashboard` user has write access to `ums/devices/+/command`
- No firmware support yet for receiving commands over MQTT

### MQTT Device Users
- Each ESP32 device must be registered in `mosquitto/passwords` using its
  `device_id` as the username (see `setup-passwords.sh`)
- `setup-passwords.sh` creates the `dashboard` user by default; device users
  must be added manually or by extending the script

### Not a Multi-Tenant Production Release
- Single-admin credential model (`UPS_AUTH_USERNAME` / `UPS_AUTH_PASSWORD_HASH`)
- No user management UI; password rotation requires `.env` update + container restart

---

## How to Deploy

```bash
# 1. Clone branch
git clone --branch local-first-architecture https://github.com/raohassandev/VOLTAGETEST.git ums
cd ums/deployment

# 2. Create secrets
cp .env.example .env
# Edit .env — set all required secrets

# 3. Generate mosquitto password file
bash mosquitto/setup-passwords.sh
# Add device users for each ESP32:
#   docker run --rm -i -v "$PWD/mosquitto:/mosquitto/config" \
#     eclipse-mosquitto:2 mosquitto_passwd /mosquitto/config/passwords <device_id>

# 4. Start the stack
docker compose up -d

# 5. Verify
curl http://localhost:3000/api/health
```

---

## Next Steps (Post-RC)

1. Modern IoT theme / UI polish — **new branch, do not touch this certified branch**
2. Firmware v0.6 — add energy analyzer metrics + command handler
3. Multi-user auth (roles beyond single admin)
4. HTTPS / TLS for production exposure
