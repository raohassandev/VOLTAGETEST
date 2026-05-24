# Testing and Certification Guide — UMS

---

## Automated Tests (Playwright / Chromium)

### Run all tests

```bash
cd web-dashboard
npm run dev          # terminal 1 — start dev server on :3303
npx playwright test  # terminal 2 — run all 74 tests
```

### Test files

| File | Tests | Coverage |
|------|-------|----------|
| `e2e/01-auth.spec.ts` | 5 | Login page, wrong creds, successful login, unauth redirect, logout |
| `e2e/02-dashboard.spec.ts` | 4 | Stat cards, nav, search, no JS errors |
| `e2e/03-alarms.spec.ts` | 4 | Heading, filter tabs, empty state, no JS errors |
| `e2e/04-admin-settings.spec.ts` | 3 | Renders, save button, no JS errors |
| `e2e/05-admin-boards.spec.ts` | 5 | Heading, tabs, scan, search, no JS errors |
| `e2e/06-admin-inventory.spec.ts` | 4 | Heading, form, save disabled, no JS errors |
| `e2e/07-admin-alarm-rules.spec.ts` | 4 | Heading, form reveal, save button, no JS errors |
| `e2e/08-admin-calibration.spec.ts` | 3 | Heading, device selector, no JS errors |
| `e2e/09-admin-users.spec.ts` | 5 | Heading, admin listed, Add user form, create disabled, no JS errors |
| `e2e/10-system-pages.spec.ts` | 19 | System index, params save, history counts/purge, feature flags |
| `e2e/11-api-smoke.spec.ts` | 18 | All GET routes → 200, stats, settings CRUD, purge, config 501, unauth 401 |

### Expected result

```
74 passed  0 failed
```

---

## Docker Certification

```bash
cd deployment
docker compose down --remove-orphans
docker compose up -d --build
docker compose ps
bash certify.sh
```

Expected:

```
postgres healthy
mosquitto up
mqtt-worker up
web healthy
certify.sh PASS
```

---

## DB Cleanup (pre-release)

Remove test devices before production handover:

```bash
cd web-dashboard
npm run db:cleanup-test:dry   # preview
npm run db:cleanup-test       # execute
```

Removes: `DOCKER-SMOKE-001`, `DEV-COM11-TEST`, `TEST-DEVICE`, `TEST-DEVICE-DUMMY`.
Does **not** remove: `UMS-3076F5A5AD54` (production board).

---

## Live Board Verification

```bash
curl -s http://192.168.0.100/api/info | python -m json.tool
curl -s http://192.168.0.100/data | python -m json.tool
```

Expected `mqtt_auth: true`, `firmware: "2.1.0"`, `mqtt_topic: "ums/devices/UMS-3076F5A5AD54/data"`.

Then verify in DB:

```sql
SELECT "deviceId", online, "lastSeenAt", ip, firmware
FROM "Device" ORDER BY "lastSeenAt" DESC;
```

---

## Visual Screenshots (QA)

```bash
cd web-dashboard
npx playwright test e2e/visual-screenshots.spec.ts
```

Screenshots saved to `qa/screenshots/web/` (not committed to git).

---

## Pre-merge Checklist

- [ ] `npm run lint` — 0 errors
- [ ] `npx playwright test` — 74/74 pass
- [ ] `docker compose up && certify.sh` — PASS
- [ ] `npm run db:cleanup-test:dry` reviewed
- [ ] Screenshots reviewed for broken layout or old topics
- [ ] `git push origin energy-analyzer-integration` complete
