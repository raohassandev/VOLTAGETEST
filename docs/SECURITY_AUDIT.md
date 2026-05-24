# Security Audit — UPS Monitoring System

**Date:** 2026-05-24  
**Branch:** `energy-analyzer-integration`  
**Commit:** `f23da25` (P0 fixes)  
**Command:** `npm audit --omit=dev` (production dependencies only)

---

## Audit Output

```
postcss  <8.5.10
Severity: moderate
PostCSS has XSS via Unescaped </style> in its CSS Stringify Output
Advisory: https://github.com/advisories/GHSA-qx2v-qp2m-jg93
Fix available via `npm audit fix --force` — would install next@9.3.3 (breaking change)
Path: node_modules/next/node_modules/postcss → node_modules/next

uuid  <11.1.1
Severity: moderate
uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided
Advisory: https://github.com/advisories/GHSA-w5hq-g745-h8pq
Fix available via `npm audit fix --force` — would install aedes@0.44.0 (breaking change)
Path: node_modules/hyperid/node_modules/uuid → node_modules/hyperid → node_modules/aedes

5 moderate severity vulnerabilities
```

One vulnerability was fixed in this release cycle (`ws` — updated via `npm audit fix`).

---

## Vulnerability Analysis

### 1. `postcss` (moderate) — XSS via `</style>` in CSS stringify output

| Field | Detail |
|-------|--------|
| Package | `postcss < 8.5.10` (nested inside `next`) |
| Severity | Moderate |
| Exploit surface | **Build-time only** — postcss processes CSS during `npm run build`, not at runtime |
| Runtime exposure | None — postcss is not called from API routes or user input paths |
| Fix | Requires `next@9.3.3` which is a **major breaking downgrade** from current Next.js 15 |
| Decision | **Deferred** — build-time only, no runtime XSS exposure in this application. Monitor for a next.js patch release. |

### 2. `uuid` (moderate) — Missing buffer bounds check in v3/v5/v6

| Field | Detail |
|-------|--------|
| Package | `uuid < 11.1.1` inside `hyperid` inside `aedes` |
| Severity | Moderate |
| Exploit surface | `aedes` is the embedded MQTT broker — only used when `ENABLE_EMBEDDED_BROKER=true` |
| Production exposure | In Docker deployment (`ENABLE_EMBEDDED_BROKER=false`), `aedes` is not loaded |
| Fix | Requires `aedes@0.44.0` which changes aedes API surface — integration risk untested |
| Decision | **Deferred** — broker not enabled in production Docker. Track aedes 0.44.0 changelog; upgrade in next sprint. |

---

## Risk Decision

Both vulnerabilities are:
- **Moderate severity** (not critical/high)
- **Build-time or conditionally disabled code paths**
- **Require breaking major-version changes** to fix

Neither is exploitable in the standard production Docker deployment where:
- `ENABLE_EMBEDDED_BROKER=false`
- Users do not supply CSS input to the server

**Conclusion: Safe to ship.** Upgrade plan:
1. Monitor Next.js for a postcss patch that doesn't require downgrade.
2. Test `aedes@0.44.0` API compatibility before upgrading.
3. Re-audit before v2.2.0 release.
