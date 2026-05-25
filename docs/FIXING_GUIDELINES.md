# Fixing Guidelines — UMS

Rules for engineers making changes to this repository.

---

## Firmware

- **Do not edit the root directory.** The canonical firmware is `firmware/VOLTAGETEST/VOLTAGETEST.ino`.
- **Do not use legacy firmware.** Archived monitor sketches must not be flashed for v2.1.0 deployments.
- **Do not change the MQTT topic.** Active topic is `ums/devices/<device_id>/data`. The old `building/.../telemetry` scheme is retired.

## Telemetry / Data Integrity

- **Do not store `null` as `0`.** Use `nullableNum()` in `mqtt-worker.ts` for all numeric energy fields. A missing sensor reading is `null`, not zero.
- **Do not add dashboard fields** unless the API actually returns them. If a field is `null`, show `—` or `Not available`.
- **Do not claim hardware accuracy** without a reference-meter calibration result. Energy fields (`p_out_w`, `pf_out`, `e_out_kwh`) may publish as `null` until the board is calibrated against a reference meter.

## Dashboard / UI

- **Do not enable config/command push buttons** unless firmware subscribes to the corresponding MQTT command topic. Unimplemented buttons must return HTTP 501 or be hidden with a badge.
- **Do not use `networkidle`** wait state on pages that have persistent SSE connections (boards page). Use `domcontentloaded`.
- **Do not add "Coming soon" placeholders** for features that have a ship date. Implement them or remove them.

## Git / Build

- **Do not commit `node_modules`, `.next`, `playwright-report`, `test-results`, or firmware `build/`** directories. All are in `.gitignore`.
- **Always run lint and tests before pushing:**
  ```bash
  cd web-dashboard
  npm run lint
  npx playwright test
  ```
- **Always include screenshots** for UI changes. Save to `qa/screenshots/` (not committed; for review only).
- **Always push to `origin`** as the final step of every task.

## MQTT Authentication

- **Do not disable MQTT auth** in production. Each device must authenticate with its `deviceId` as username.
- **Do not expose MQTT password** in the device web UI. The password field must show placeholder "Leave blank to keep existing password" and submit without change if left blank.

## Known Open Limitations (do not close without implementing)

| Item | Location | Required action |
|------|----------|-----------------|
| Config push via MQTT | `src/app/api/devices/[deviceId]/config/route.ts` | Firmware must subscribe to `ums/devices/{id}/config` |
| Command subscription | Boards page | Firmware must subscribe to `ums/devices/{id}/command` |
| Active power / PF / kWh | All telemetry paths | Requires simultaneous V+I sampling or power metering IC |
| EventBus cluster mode | `src/lib/event-bus.ts` | Replace with Redis pub/sub if multi-process mode is needed |
| Windows ARP format | `src/lib/lan-scanner.ts` | Verify format on Windows 11 target |
