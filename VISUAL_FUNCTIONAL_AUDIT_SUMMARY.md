# Visual and Functional Release Audit Summary

**Branch:** professionalization-plan
**Audit date:** 2026-05-21
**Auditor:** Claude Sonnet 4.6 (Claude Code)

---

## Audit Files

| File | Content |
|------|---------|
| [visual-audit/ums-release-audit-2026-05-21/00_REPO_STATE.md](visual-audit/ums-release-audit-2026-05-21/00_REPO_STATE.md) | Repo state, git log, environment, running services |
| [visual-audit/ums-release-audit-2026-05-21/01_ROUTE_FEATURE_INVENTORY.md](visual-audit/ums-release-audit-2026-05-21/01_ROUTE_FEATURE_INVENTORY.md) | All routes, all API routes, all features with PASS/PARTIAL/MISSING/BROKEN status |
| [visual-audit/ums-release-audit-2026-05-21/02_SCREENSHOT_INDEX.md](visual-audit/ums-release-audit-2026-05-21/02_SCREENSHOT_INDEX.md) | 36 screenshots (9 screens × 4 viewports) with visual status |
| [visual-audit/ums-release-audit-2026-05-21/03_FUNCTIONAL_AUDIT.md](visual-audit/ums-release-audit-2026-05-21/03_FUNCTIONAL_AUDIT.md) | Functional test results for all flows A–J |
| [visual-audit/ums-release-audit-2026-05-21/04_VISUAL_UX_AUDIT.md](visual-audit/ums-release-audit-2026-05-21/04_VISUAL_UX_AUDIT.md) | 18 UX issues; severity; responsive UI summary table |
| [visual-audit/ums-release-audit-2026-05-21/05_CODE_ARCHITECTURE_AUDIT.md](visual-audit/ums-release-audit-2026-05-21/05_CODE_ARCHITECTURE_AUDIT.md) | Per-file status; dead code; hardcoded secrets; missing error handling |
| [visual-audit/ums-release-audit-2026-05-21/06_RELEASE_GAP_LIST.md](visual-audit/ums-release-audit-2026-05-21/06_RELEASE_GAP_LIST.md) | Master gap list P0–P3 with effort estimates |
| [visual-audit/ums-release-audit-2026-05-21/screenshots/](visual-audit/ums-release-audit-2026-05-21/screenshots/) | 36 PNG screenshots |

---

## Critical Findings (P0 — Blocks Demo)

| # | Finding | File | Severity | Status |
|---|---------|------|----------|--------|
| 1 | **volt_dc alarm bug**: Alarm compares raw ADC value (556.7) against voltage threshold (57.024V). Every board will show "Battery Voltage critically high: 556.7" — incorrect and confusing to any observer. | alarm-engine.ts / mqtt-worker.ts | BLOCKER | **FIXED** — 1dbc381. Worker now applies 0.0442 scale (CalibrationProfile or default) to volt_dc before alarm evaluation. |
| 2 | **No board IP in fleet table**: Device IP is available in API (/api/devices) but not shown in the fleet table. Operator cannot see which device is at which address from the main view. | page.tsx FleetTable | BLOCKER | **FIXED** — 1dbc381. "Board IP" column added with clickable link and Config/Data/OTA sub-links. |
| 3 | **No board portal button**: Board IP shown as plain text in UPS detail device info. No clickable link to open the board's web portal at http://\<ip\>/. | ups/[id]/page.tsx | BLOCKER | **FIXED** — 1dbc381. "Open portal", "Config", "OTA" buttons added in Device info section. |
| 4 | **Alarm rule UPS-scope requires DB cuid**: Creating a rule scoped to a specific UPS requires entering the internal database cuid (e.g., cmpfc1po2001311w6r6dtc2mq), not the user-visible UPS ID (e.g., UPS-COM11-TEST). Normal users cannot use this feature. | admin/alarm-rules/page.tsx:204 | BLOCKER | **FIXED** — 1dbc381. UPS-scope input replaced with dropdown populated from /api/ups. |
| 5 | **Duplicate active alarm rows**: Multiple active volt_dc alarms per device with the same firstSeenAt — alarm list appears cluttered and incorrect. | DB / alarm-engine.ts | HIGH | **FIXED** — 1dbc381. alarm-engine uses updateMany; startup dedup cleans existing rows. |

---

## Functional Test Summary

| Flow | Tests | PASS | PARTIAL | FAIL/BLOCKED |
|------|-------|------|---------|-------------|
| A — Login | 5 | 4 | 1 | 0 |
| B — Fleet dashboard | 8 | 5 | 0 | 3 (IP missing, portal missing) |
| C — UPS detail | 11 | 7 | 1 | 3 (portal, chart, volt_dc) |
| D — Inventory | 6 | 5 | 1 | 0 |
| E — Alarm rules | 6 | 4 | 1 | 1 (UPS cuid bug) |
| F — Alarms | 7 | 4 | 0 | 3 (volt_dc, duplicate rows) |
| G — Settings | 4 | 2 | 0 | 2 (feature flags missing) |
| H — History | 4 | 3 | 1 | 0 (chart missing) |
| I — LAN-only | 4 | 3 | 1 | 0 |
| J — Docker | 3 | 0 | 0 | 3 (Docker not installed) |

---

## Gap Summary

| Priority | Count | Description |
|----------|-------|-------------|
| P0 (demo blockers) | 5 | volt_dc alarm bug, board IP, portal button, alarm rule cuid UX, duplicate alarms |
| P1 (field pilot) | 8 | Docker, MQTT Docker, trend chart, rule edit, responsive tables, LAN docs, ackBy, delete confirm |
| P2 (production) | 8 | User management, access control, calibration UI, OTA link, board mgmt page, restore proof, API auth, page titles |
| P3 (later) | 6 | Pagination, CSRF, mobile header, soft delete, dead code cleanup |

---

## Production Ship Status

| Gate | Status | Reason |
|------|--------|--------|
| Demo | **YES** (all P0 blockers fixed, 1dbc381) | volt_dc alarm fixed, board IP shown, portal buttons added, alarm rule UX fixed, duplicate alarms resolved |
| Field pilot | NO | Docker not tested; P1 gaps unresolved (trend chart, responsive tables, rule edit) |
| Production | NO | Docker and Docker MQTT not proven; user management missing; P2 gaps unresolved |
