# UMS Release Notes — v0.5.2 / Dashboard r01a50b5

**Release date:** 2026-05-21  
**Branch:** professionalization-plan  
**Final commit:** 01a50b5

---

## Firmware

**Version:** 0.5.2  
**Target:** ESP32 Dev Module (esp32:esp32:esp32)

### Supported features

- First-boot setup AP with SSID `UMS-SETUP-<last4MAC>` and password `UMSSetup2026`
- Commissioning config portal at `/config` (identity, WiFi, MQTT, security, calibration)
- DHCP and static IP support
- AP auto-off after STA connects (configurable `setup_ap_always` flag)
- AP fallback on STA connection failure (auto retry every 60 s)
- MQTT publish to configured broker on configurable interval (default 5 s)
- Live measurement: input AC voltage, output AC voltage, battery DC voltage, input CT current, output CT current, apparent power VA
- Calibration coefficients: per-channel scale + offset, AC zero ADC reference
- OTA firmware update at `/update`
- Factory reset at `/factory-reset`
- Serial monitor at 921600 baud

### Unsupported features (hardware limitation)

- Active power (W) — requires simultaneous V/I sampling or power metering IC
- Power factor — requires active power
- Energy (kWh) — requires active power integration
- Reactive power (VAr)

### Known limitations

- ADC non-linearity at the extremes of the input range (near 0 V or 3.3 V on the ADC pin) — keep sensor outputs within 0.2–2.9 V on the ADC pin
- CT current accuracy ±5–10% uncalibrated; ±1–3% with proper CT installation and calibration
- Voltage accuracy ±3–5% uncalibrated; ±1–2% with calibration
- No MQTT TLS in firmware MVP; use MQTT credentials (user/pass) for access control

---

## Dashboard

**Commit:** 01a50b5  
**Stack:** Next.js 16, PostgreSQL, Prisma ORM, MQTT worker, Mosquitto

### Supported features

- Fleet page: live UPS list with online/offline status, last seen, voltage, load
- UPS detail page: live telemetry, 24-hour history charts, commissioning status panel, physical location panel
- Alarm system: per-device alarms with active/cleared state, debounce, hysteresis
- Configurable alarm rule overrides: device > UPS unit > site > global > hardcoded defaults
- Admin: inventory management (add/edit/delete UPS units), alarm rules CRUD
- Authentication: bcrypt password hash, session cookie, production startup validation
- MQTT worker: auto-reconnect, telemetry ingest, device online/offline tracking
- Rollup worker: 1-minute aggregates from raw telemetry for history charts
- Docker Compose deployment: postgres, mosquitto, web, mqtt-worker

### Unsupported features

- Multi-user login (single admin account only)
- kW / kWh / power factor display (hardware limitation — shows `—`)
- MQTT TLS
- Email/SMS alarm notifications
- Report export (CSV, PDF)

### Known limitations

- Dashboard session is cookie-based; no session revocation unless `UPS_AUTH_TOKEN` is rotated
- MQTT broker has no TLS in MVP; run on a private/internal network or behind a VPN
- Docker deployment not tested in this release cycle (Docker not available on dev machine); deployment files reviewed and appear correct

---

## Deployment steps

See `docs/DEPLOYMENT_GUIDE.md` for full instructions.

Quick reference:

```bash
git clone --branch professionalization-plan https://github.com/raohassandev/VOLTAGETEST.git UMS
cd UMS
cp web-dashboard/.env.example .env
# Edit .env — set all required values
docker compose -f deployment/docker-compose.yml --env-file .env up -d --build
curl http://localhost:3000/api/health
```

---

## Rollback plan

1. Note the current commit before upgrading: `git log --oneline -1`
2. To roll back: `git checkout <previous-commit-hash>`
3. Rebuild Docker images: `docker compose ... up -d --build`
4. Database schema changes are additive in this release (no column drops); rollback does not require a migration undo
5. Firmware rollback: flash previous `.bin` via OTA at `/update` or via USB

---

## Upgrade notes

- If upgrading from a pre-v0.5.2 firmware, do a factory reset after flashing to clear stale NVS data
- Dashboard environment variable `ALLOW_DEV_AUTH` is new in this release; existing deployments without it are unaffected (treated as false)
- The `AlarmRule` table was added in this release cycle; `prisma migrate deploy` applies it automatically on first start
