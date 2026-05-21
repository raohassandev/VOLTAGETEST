# 06 — Release Gap List

**Audit date:** 2026-05-21

P0 = must fix before demo | P1 = must fix before field pilot | P2 = must fix before production | P3 = later

---

| Priority | Gap | Area | Severity | Required before demo | Required before production | Estimated effort | Notes |
|----------|-----|------|----------|---------------------|--------------------------|-----------------|-------|
| P0 | volt_dc alarm engine bug — raw ADC (556.7) compared to voltage threshold (57.024V) | alarm-engine.ts | BLOCKER | YES | YES | 1–2h | Worker receives raw ADC from MQTT; alarm thresholds are in volts; calibration scale must be applied before comparison. Default scale 0.0442 gives 24.6V — well below highCritical 57V, so alarm should NOT fire. |
| P0 | Board IP column in fleet table | page.tsx FleetTable | BLOCKER | YES | YES | 1h | Add ip column from device data. /api/telemetry/latest already returns ip field. Make IP a clickable link opening http://\<ip\>/ |
| P0 | Board portal button on UPS detail | ups/[id]/page.tsx | BLOCKER | YES | YES | 30m | IP shown as text in Device info. Add "Open portal →" button/link using device.ip |
| P0 | Alarm rule UPS-scope UX broken | admin/alarm-rules/page.tsx | BLOCKER | YES | YES | 2h | Replace raw cuid input with dropdown from /api/ups list. Show "UPS-COM11-TEST" not cuid. |
| P0 | Alarm duplicate rows cleanup | alarm-engine.ts + DB | HIGH | YES | YES | 1h | Multiple active volt_dc alarms per device with same firstSeenAt. Review alarm deduplication logic. May need one-time DB cleanup for demo. |
| P1 | Docker deployment proof | deployment/ | BLOCKER | NO | YES | 2–4h (setup) | Install Docker Desktop. Run Phase G sequence. All 4 services must start and pass health check. |
| P1 | Docker MQTT ingest proof | deployment/ | BLOCKER | NO | YES | 1h | After Docker UP, publish test payload. Verify TelemetryRaw, /api/telemetry/latest, device online. |
| P1 | History / trend chart on UPS detail | ups/[id]/page.tsx | HIGH | NO | YES | 3–4h | TrendChart was removed. /api/telemetry/history works. Add simple recharts or Chart.js line chart. |
| P1 | Alarm rule inline edit | admin/alarm-rules/page.tsx | MEDIUM | NO | YES | 2h | Only create+delete now. Add edit flow so existing rule values can be updated without full delete. |
| P1 | Delete UPS confirmation | admin/inventory/page.tsx | MEDIUM | NO | YES | 30m | Add window.confirm or modal before hard delete. |
| P1 | Responsive fleet table | page.tsx | HIGH | NO | YES | 3h | min-w-[980px] table overflows mobile and tablet. Implement column priority hiding. |
| P1 | Responsive alarms table | alarms/page.tsx | HIGH | NO | YES | 2h | min-w-[860px] overflow on mobile. |
| P1 | LAN-only setup instructions | docs/ | MEDIUM | NO | YES | 1h | No bare-metal (no Docker) LAN deploy guide. Add to DEPLOYMENT_GUIDE.md. |
| P1 | acknowledgedBy from session | alarms/page.tsx | MEDIUM | NO | YES | 1h | Hardcoded "operator". Use session username from cookie/auth API. |
| P2 | User management UI + API | admin/users | HIGH | NO | YES | 6–8h | User model in schema, no UI or API. Single-user env-var auth limits multi-user sites. |
| P2 | Access control / roles | Multiple | HIGH | NO | YES | 4–6h | Role field in User model; no enforcement. Admin vs operator vs viewer roles needed. |
| P2 | CalibrationProfile API + UI | admin/ | HIGH | NO | YES | 4–6h | Model in schema; no CRUD. Calibration guide written but no UI to apply it via dashboard. |
| P2 | OTA firmware link from dashboard | ups/[id]/page.tsx | MEDIUM | NO | YES | 1h | No link to http://\<ip\>/update. Add button to open board OTA page. |
| P2 | Board management page | admin/boards | MEDIUM | NO | YES | 4–6h | No dedicated page to see all boards, their IP, firmware, RSSI, commissioning status in one place. |
| P2 | Restore end-to-end test | deployment/ | MEDIUM | NO | YES | 1h (with Docker) | restore.sh not tested on fresh DB. Must be proven before production. |
| P2 | Per-route API auth checks | All /api/* routes | MEDIUM | NO | YES | 2h | API routes not protected; middleware only guards page routes. Bypass possible via direct curl. |
| P2 | Dynamic page titles | layout.tsx | LOW | NO | NO | 1h | All pages show "UPS Monitoring System" in browser tab. |
| P2 | Admin navigation breadcrumb | All admin pages | LOW | NO | NO | 2h | No cross-admin navigation. Each page only has back-to-dashboard. |
| P2 | src/lib/mqtt-ingestion.ts dead code | src/lib/ | LOW | NO | NO | 30m | Browser MQTT ingestion helper; no longer referenced by any page. Remove. |
| P3 | Alarm history pagination | /api/alarms + UI | LOW | NO | NO | 2h | Hardcoded 200-row limit. |
| P3 | Telemetry history pagination | /api/telemetry/history | LOW | NO | NO | 2h | Hardcoded 500-row raw limit. |
| P3 | CSRF protection on login | login/page.tsx | LOW | NO | NO | 1h | Form POST without CSRF token; acceptable for LAN-only but not internet-facing. |
| P3 | Mobile header menu | page.tsx | LOW | NO | NO | 2h | 6 header buttons wrap to 3 lines on mobile 390px. |
| P3 | Deactivate UPS (soft delete) | admin/inventory | LOW | NO | NO | 2h | Currently hard delete only. |

---

## Demo Readiness (P0 items only)

The following P0 items block a clean demo:

1. **volt_dc alarm messages show raw ADC values** — every demo board will show "Battery Voltage critically high: 556.7" which is obviously wrong to any viewer.
2. **No board IP/portal buttons** — manager specifically called this out. Operator/demo audience expects to see device IP and click to open board portal.
3. **Alarm rule UPS-scope requires DB cuid** — if demonstrated, this will look broken.
4. **Duplicate active alarm rows** — alarm page will show 4 nearly identical volt_dc alarms.

If P0 items are fixed, the system can be demoed for internal review. It is NOT field-pilot or production ready without P1 items.
