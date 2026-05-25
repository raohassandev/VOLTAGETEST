# Security Audit - VOLTAGETEST / UMS v2.1.0

**Date:** 2026-05-26
**Branch:** `energy-analyzer-integration`
**Command:** `npm audit --omit=dev`

## Current Result

```text
found 0 vulnerabilities
```

No production dependency waiver is currently required.

## Production Controls

- Production startup requires `UPS_AUTH_PASSWORD_HASH`, `UPS_AUTH_TOKEN`, `DATABASE_URL`, and `UMS_LICENSE_PUBLIC_KEY_PEM`.
- Plaintext `UPS_AUTH_PASSWORD` is rejected in production.
- `UMS_LICENSE_PUBLIC_KEY_PEM` must parse as a real Ed25519 public key and must not be placeholder text.
- Offline licenses are signed with an Automatrix private key that must remain outside this repository.
- Production Docker uses Mosquitto with `ENABLE_EMBEDDED_BROKER=false`.

## Release Note

This document does not certify Playwright or Docker results. Use the current proof files under `docs/audit/logs/2026-05-25/` and the final release report for certification status.
