# Security Audit - UPS Monitoring System

**Date:** 2026-05-25  
**Branch:** `energy-analyzer-integration`  
**Command:** `npm audit --omit=dev --json`  
**Log:** `docs/audit/logs/2026-05-25/npm-audit.log`

## Summary

Current production dependency audit reports:

```text
5 moderate vulnerabilities
0 high
0 critical
```

Known chains:

- `next -> postcss`
- `aedes -> hyperid -> uuid`

## `postcss` via `next`

| Field | Detail |
|-------|--------|
| Severity | Moderate |
| Advisory | `postcss <8.5.10` CSS stringify XSS advisory |
| Path | `node_modules/next/node_modules/postcss` |
| Exposure | Build-time CSS processing. The app does not expose server-side user CSS processing. |
| Current fix offered by npm | `next@9.3.3`, which is a breaking downgrade from the current Next 16 line. |
| Decision | Defer forced fix; track Next.js patch releases and re-audit before release tagging. |

## `uuid` via `aedes`

| Field | Detail |
|-------|--------|
| Severity | Moderate |
| Advisory | `uuid <11.1.1` buffer bounds check advisory |
| Path | `aedes -> hyperid -> uuid` |
| Exposure | Embedded Aedes broker path only. Production Docker uses Mosquitto with `ENABLE_EMBEDDED_BROKER=false`. |
| Current fix offered by npm | `aedes@0.44.0`, a breaking major-version change. |
| Decision | Defer until Aedes compatibility can be tested; production deployment does not load embedded broker. |

## Production Controls

- Production Docker uses Mosquitto, not the embedded broker.
- Startup now rejects missing or placeholder production secrets.
- Production startup requires `UPS_AUTH_PASSWORD_HASH`, `UPS_AUTH_TOKEN`, and `DATABASE_URL`.
- Plaintext `UPS_AUTH_PASSWORD` is rejected in production.

## Upgrade Plan

1. Re-run `npm audit --omit=dev --json` before merge/tag.
2. Track the Next.js/PostCSS fix path without downgrading Next.
3. Test an Aedes upgrade in a dev-only branch before enabling embedded broker in any deployment.
4. Treat any future high/critical vulnerability as a release blocker.

## Ship Decision

The current vulnerabilities are moderate and either build-time or disabled in production Docker. They are acceptable only if the final release decision remains backed by passing lint/build/Playwright and Docker certification evidence.
