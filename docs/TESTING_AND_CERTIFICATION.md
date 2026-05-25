# Testing And Certification Guide - VOLTAGETEST / UMS v2.1.0

This guide describes the current release verification path. Historical audit reports and old RC evidence must not be used as final release proof.

## Web Dashboard Checks

```bash
cd web-dashboard
npm ci
npm run db:generate
npm run lint
npm run typecheck
npm test
npm run build
npm run license:test
npx playwright test
npm audit --omit=dev
```

## Docker Certification

Run on a real Docker/WSL/Linux environment:

```bash
cd deployment
docker compose down -v --remove-orphans
docker compose config
docker compose up -d --build
CERT_ADMIN_PASSWORD=<actual-admin-password> UMS_LICENSE_PUBLIC_KEY_PEM="$(cat public-key.pem)" bash certify.sh
```

Final proof files:

- `docs/audit/logs/2026-05-25/certify.txt`
- `docs/audit/logs/2026-05-25/docker-compose-ps.txt`

`certify.txt` must include the final certified commit hash, `git status --short`, migration/table checks, MQTT smoke proof, DB telemetry proof, backup/restore proof, clean source package inspection, and the final line:

```text
ALL CERTIFICATION STEPS PASSED
```

## Clean Source Package

```bash
cd web-dashboard
npm run package:build
```

Expected archive:

```text
VOLTAGETEST-v2.1.0-source-clean.zip
```

The package inspection must reject secrets, private keys, dependency folders, build output, failed proof logs, database dumps, and local cache/temp files.

## Live Board Condition

Software certification does not replace field proof. Full PASS requires a completed live-board calibration report using:

- `docs/CALIBRATION_GUIDE.md`
- `release/UMS_FIELD_TEST_REPORT_TEMPLATE.md`
