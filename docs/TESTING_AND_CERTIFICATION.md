# Testing And Certification Guide - VOLTAGETEST / UMS v2.1.0

Official certified package targets:

- Windows Installer Package
- Linux Native Package

Optional and not certified for this release:

- Docker deployment

## Core Commands

```bash
cd web-dashboard
npm ci
npm run db:generate
npm run lint
npm run typecheck
npm run license:test
npm run build
npm audit --omit=dev
npm run package:build
```

## Windows Installer Certification

Save proof to:

```text
docs/audit/logs/2026-05-25/windows-installer-proof.txt
```

The proof must end with:

```text
WINDOWS INSTALLER CERTIFICATION PASSED
```

Required coverage: installer build, configuration pages, password hashing, license public key env, service creation/startup, browser health, login, license install/reject, UPS add/edit/seat enforcement, dashboard load, backup/restore, logs, and uninstall preserving data by default.

## Linux Native Certification

Save proof to:

```text
docs/audit/logs/2026-05-25/linux-native-proof.txt
```

The proof must end with:

```text
LINUX NATIVE CERTIFICATION PASSED
```

Required coverage: install script, Node/PostgreSQL checks, env file, license public key validation, Prisma migrations, systemd service install/start, health endpoint, login, license install, UPS add/edit/seat enforcement, backup/restore, and uninstall preserving data by default.

## Playwright

Playwright must either pass or be explicitly waived in the final release report with a replacement manual UI checklist/screenshots. Do not rely on stale Playwright results.

## Clean Artifacts

Generated artifacts must not include `.git`, `.claude`, `settings.local.json`, `node_modules`, `.env` secrets, private signing keys, failed proof logs, local credentials, database dumps, or temp/cache output.

## Hardware Condition

If no hardware is connected, the final release report must state:

```text
Live board proof/calibration pending
```
