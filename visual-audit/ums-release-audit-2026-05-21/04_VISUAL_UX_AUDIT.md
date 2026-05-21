# 04 — Visual UX Audit

**Audit date:** 2026-05-21
**Screenshots:** screenshots/ folder (36 images, 4 viewports per screen)

---

## Issue Table

| Issue ID | Screen | Severity | Problem | User impact | Required fix |
|----------|--------|----------|---------|-------------|--------------|
| UX-01 | Fleet dashboard | BLOCKER | No board IP column in fleet table. IP is in /api/devices but not shown | Operator cannot see which device is at which IP address from the fleet view | Add IP column to FleetTable, make it a clickable link |
| UX-02 | Fleet dashboard / UPS detail | BLOCKER | No "Open board portal" button anywhere. IP shown as plain text in detail only | Operator cannot click to open board's web config portal at http://\<ip\>/ | Add clickable IP link in fleet table AND "Open portal" button in UPS detail header |
| UX-03 | Alarm rules | BLOCKER | UPS-scope rules require entering internal DB cuid, not UPS ID string. Label says "UPS Unit ID (DB cuid)" | Admin cannot create per-UPS rules without knowing the database internal ID — impossible for end users | Replace cuid input with a dropdown populated from /api/ups list |
| UX-04 | Alarm rules | HIGH | No edit button on existing rules — only delete + re-create | Admin must delete a rule and re-enter all values to change one threshold | Add edit (in-line or modal) for existing rules |
| UX-05 | Fleet table (all viewports) | HIGH | Table has `min-w-[980px]`. On tablet (768px) and mobile (390px), table is horizontally scrollable but not responsive | On tablet/mobile, content requires horizontal scroll; columns not prioritized | Implement responsive column hiding (hide secondary columns on small screens) |
| UX-06 | Alarms table | HIGH | Table `min-w-[860px]`. Same issue on tablet/mobile | Full alarm data requires horizontal scroll | Same approach as UX-05 |
| UX-07 | UPS detail | HIGH | No history/trend chart. History API works and returns data, but no chart in UI | Operator cannot visualize voltage trends over time | Add simple line chart using /api/telemetry/history data |
| UX-08 | Fleet dashboard | MEDIUM | "Manufacturer settings" section at bottom of fleet page shows retention inputs. Name is confusing — these are admin/system settings, not manufacturer-specific | Users are confused about what "manufacturer" means here | Rename to "Quick settings" or remove from fleet page and link to /admin/settings only |
| UX-09 | UPS detail | MEDIUM | volt_dc alarm shows raw ADC value (556.7V) vs voltage threshold (57.024V). Alarm message is technically wrong | Operator sees "Battery Voltage critically high: 556.7" — confusing and incorrect value | Fix alarm engine to apply volt_dc calibration scale before comparison |
| UX-10 | Alarms page | MEDIUM | Multiple duplicate active volt_dc alarms for the same device with same firstSeenAt | Alarm list appears cluttered with 4+ identical rows | Investigate and clean duplicate rows; ensure deduplication in alarm engine |
| UX-11 | All admin pages | MEDIUM | No visible navigation links between admin sections. Each page has only a back-to-dashboard arrow | Admin must return to dashboard to navigate between Inventory, Settings, Alarm Rules | Add admin navigation bar or breadcrumb across admin pages |
| UX-12 | Login page | MEDIUM | No "Forgot password" or self-service reset. Single admin user only. No username shown after login | Multi-user environments cannot be supported without code changes | Document single-user limitation in operator guide; implement user management for production |
| UX-13 | Fleet dashboard (mobile-390x844) | MEDIUM | Header buttons wrap onto 3 lines. "API online", alarm count, Alarm log, Inventory, Settings, Sign out — all overflow on mobile | Mobile operator cannot use header controls | Reduce to icon-only buttons or move secondary links to hamburger menu |
| UX-14 | UPS detail | LOW | acknowledgedBy is hardcoded to "operator" string in all ack calls. Real user identity not captured | Audit trail shows "operator" for every acknowledge, not the actual user | Use session username from cookie/auth for acknowledgedBy |
| UX-15 | Inventory | LOW | No confirmation dialog before deleting a UPS unit | Accidental delete possible | Add window.confirm or modal confirmation |
| UX-16 | Alarms page | LOW | UPS ID link in alarm row links to /ups/[upsId] using the upsId string value. If UPS unit doesn't exist in inventory, link goes to "UPS not found." | Orphan alarms look broken | Gracefully handle missing UPS units |
| UX-17 | Fleet dashboard | LOW | Fleet summary "Online" count uses `nowMs - lastSeenMs < 60_000` (1 minute threshold), but offline threshold in settings can be changed. Summary count and settings are decoupled | Displayed count may disagree with actual online status | Use same threshold for display as settings |
| UX-18 | All pages | LOW | No page title or breadcrumb shows current location. Tabs show "UPS Monitoring System" for all pages | Browser tab cannot distinguish pages | Set dynamic page titles per route |

---

## Responsive UI Summary

| Screen | Desktop 1920 | Laptop 1366 | Tablet 768 | Mobile 390 | Assessment |
|--------|-------------|-------------|-----------|-----------|------------|
| Login | PASS | PASS | PASS | PASS | Clean single column |
| Fleet dashboard | PASS | PASS | ACCEPTABLE | CLUTTERED | Header wraps; table requires horizontal scroll |
| UPS detail | PASS | PASS | ACCEPTABLE | ACCEPTABLE | Card grid collapses correctly; detail table scrollable |
| Alarms | PASS | PASS | ACCEPTABLE | NOT RESPONSIVE | 9-column table scrolls, not compressed |
| Alarm rules | PASS | PASS | ACCEPTABLE | NOT RESPONSIVE | 11-column table scrolls |
| Inventory | PASS | PASS | ACCEPTABLE | NOT RESPONSIVE | 7-column table scrolls |
| Settings | PASS | PASS | PASS | PASS | Simple form, responsive |

---

## Visual Quality Assessment

- **Color/status consistency:** PASS — emerald = online/normal, amber = warning, red = critical/offline. Used consistently.
- **Typography:** PASS — system font stack; clean Tailwind prose.
- **Industrial/professional look:** ACCEPTABLE — white cards on slate background; suitable for internal tool. Not polished enough for branded customer-facing product.
- **Empty states:** PASS — "Waiting for UPS telemetry." on fleet, "No active alarms — all systems normal." on alarms.
- **Error states:** PASS — /ups/DOES-NOT-EXIST shows "UPS not found." with back link.
- **Loading states:** PASS — "Loading…" shown on UPS detail and alarm rules.
- **Measurement limitation visibility:** PASS — Three metric cards explicitly show "— (not supported)" for W, kWh, PF. Settings page also documents limitation.
