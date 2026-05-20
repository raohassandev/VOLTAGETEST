# UPS Monitoring System - Professional Project Plan

## 1. Product Goal

Build a professional UPS monitoring platform for approximately 50 UPS units in a large building. Each UPS has one ESP32-based monitoring module connected to:

- Input AC voltage: nominal 230 VAC
- Output AC voltage: nominal 230 VAC
- Input current transformer
- Output current transformer
- Battery DC voltage terminal

The system must help operators monitor live status, analyze history, identify abnormal behavior early, and take preventive action before UPS failure or load interruption.

## 2. Current State

### Done

- Git branch `professionalization-plan` created and pushed.
- Project documentation moved to `docs/`.
- ESP32 firmware moved to `firmware/ups_monitor/ups_monitor.ino`.
- Firmware `0.3.0` supports device/site/UPS identity provisioning.
- Firmware MQTT broker/topic/username/password are provisioned, not hardcoded demo credentials.
- Firmware local web OTA is available at `/update`.
- Firmware uses calibrated RMS-style foundations for AC voltage/current and DC average for battery.
- Firmware publishes identity, firmware, RSSI, uptime, and apparent power fields.
- Dashboard has fixed-credential login and protected routes.
- Dashboard has fleet summary/table for multiple UPS modules.
- Dashboard has add/edit/remove UPS inventory.
- Inventory and manufacturer retention settings are stored through JSON-backed APIs.
- Deployment skeleton exists for Docker Compose and Mosquitto.
- Firmware compile, dashboard lint, and dashboard build pass.

### In Progress

- Backend MQTT ingestion: started with `src/lib/mqtt-ingestion.ts`.
- Server-side latest telemetry/history APIs: started with `/api/telemetry/latest` and `/api/telemetry/history`.
- Server-side alarm evaluation.

### Pending

- PostgreSQL persistence and migrations.
- Durable telemetry history and rollups.
- Individual UPS detail route.
- Alarm acknowledgment and audit log.
- Server-controlled fleet OTA.
- Real active/reactive power, power factor, and energy counters.
- Notifications by email/SMS/WhatsApp.
- Production TLS/reverse proxy setup.
- Role-based multi-user database auth.

### Firmware

Current file: `firmware/ups_monitor/ups_monitor.ino`

The ESP32 currently:

- Samples 5 ADC channels.
- Calculates calibrated RMS-style AC voltage/current foundations and DC battery average.
- Hosts a local WiFi configuration page.
- Supports DHCP/static IP.
- Publishes JSON telemetry to a configured MQTT broker.
- Supports local web OTA.

Current limitations:

- Field calibration still must be performed per installed UPS.
- No phase measurement, so active/reactive power and power factor are not reliable yet.
- No local buffering when network is down.
- MQTT Last Will/status topics are not implemented yet.

### Web Dashboard

Current app: `web-dashboard`

The dashboard currently:

- Connects to MQTT from the browser while backend ingestion is being built.
- Shows a fleet summary and UPS table.
- Stores inventory and retention settings through JSON-backed APIs.
- Supports basic thresholds and active alarms.
- Supports fixed-credential login.

Current limitations:

- No PostgreSQL database.
- No database-backed users or roles.
- No durable telemetry history.
- No server-side alarm engine.
- No reporting, exports, or audit trail.

## 3. What We Can Measure From Current Inputs

### Directly Available After Calibration

These are achievable with the existing five physical inputs:

- Input voltage RMS: `V_in_rms`
- Output voltage RMS: `V_out_rms`
- Battery voltage DC: `V_batt`
- Input current RMS: `I_in_rms`
- Output current RMS: `I_out_rms`
- Apparent input power: `S_in = V_in_rms * I_in_rms`
- Apparent output power: `S_out = V_out_rms * I_out_rms`
- Estimated load percentage, if UPS rating is configured.
- Input energy estimate in kVAh.
- Output energy estimate in kVAh.
- Battery voltage trend and low/high battery alarms.
- Input power availability.
- UPS output availability.
- Transfer/on-battery inference from input/output/battery behavior.
- Overload inference from output current or configured UPS kVA rating.

### Possible, But Requires Better Sampling And Math

These require synchronized voltage/current waveform sampling and enough samples per AC cycle:

- True RMS voltage and current.
- Active power: watts.
- Power factor.
- Frequency.
- Phase angle.
- Reactive power: VAR.
- Active energy: kWh.
- Reactive energy: kVARh.
- Harmonic distortion indicators, approximate only unless sampling rate and analog front-end are improved.

Important: active power, reactive power, and power factor cannot be trusted from independent averaged voltage/current magnitudes. We need waveform samples for voltage and current at the same time window and phase alignment/calibration for each CT and voltage sensing circuit.

### Not Available Without Extra Inputs Or UPS Protocol

These cannot be known accurately from the listed analog inputs alone:

- UPS internal fault codes.
- Battery health/remaining runtime from UPS BMS.
- Battery temperature.
- Charger state.
- Bypass mode confirmation.
- Exact UPS mode if the electrical behavior is ambiguous.
- Individual battery cell condition.

If later the UPS supports SNMP, Modbus, RS-232, USB HID, or dry contacts, we can add those for richer status.

## 4. Recommended Production Architecture

### Device Layer

Each ESP32 module should have:

- Unique device ID, for example `UPSMON-001`.
- Assigned UPS identity, for example `UPS-01`.
- Serial number, location, floor, room, panel, UPS rating, battery bank voltage, installer notes.
- Secure MQTT credentials.
- Firmware version.
- Hardware revision.
- Calibration profile.
- OTA update support.
- Watchdog and self-health reporting.

Recommended topic pattern:

```text
building/{site_id}/ups/{device_id}/telemetry
building/{site_id}/ups/{device_id}/status
building/{site_id}/ups/{device_id}/alarm
building/{site_id}/ups/{device_id}/command
building/{site_id}/ups/{device_id}/ota
```

Recommended telemetry payload:

```json
{
  "device_id": "UPSMON-001",
  "ups_id": "UPS-01",
  "firmware": "1.0.0",
  "ts_device": 1788800000,
  "seq": 123456,
  "measurements": {
    "v_in": 230.4,
    "v_out": 229.8,
    "v_batt": 53.7,
    "i_in": 4.2,
    "i_out": 3.9,
    "s_in_va": 967.7,
    "s_out_va": 896.2,
    "p_in_w": 910.0,
    "p_out_w": 850.0,
    "q_in_var": 329.0,
    "q_out_var": 283.0,
    "pf_in": 0.94,
    "pf_out": 0.95,
    "freq_hz": 50.0,
    "e_in_kwh": 152.31,
    "e_out_kwh": 144.82
  },
  "status": {
    "input_present": true,
    "output_present": true,
    "on_battery": false,
    "overload": false
  },
  "network": {
    "ip": "192.168.1.90",
    "rssi": -55
  }
}
```

During early production, fields like watts, VAR, PF, and kWh can be marked `null` until waveform power calculation is validated.

### Server Layer

Recommended stack:

- Private Mosquitto broker with username/password, ACLs, and TLS where practical.
- Backend API service for ingestion, auth, device management, alarms, and reports.
- PostgreSQL database.
- Next.js web app for dashboard and admin UI.
- Background worker for alarm evaluation, retention cleanup, rollups, and notifications.
- Nginx reverse proxy with HTTPS.
- Systemd or Docker Compose for deployment.

For 50 UPS units, PostgreSQL is sufficient. TimescaleDB is optional later, but plain PostgreSQL partitioning and rollup tables are enough for the expected data rate.

### Data Rate Recommendation

Do not store every 500 ms sample forever.

Suggested production rates:

- Device publishes live telemetry every 2 to 5 seconds.
- Dashboard live view updates every 2 to 5 seconds.
- Raw storage: every 5 seconds for short retention.
- Minute rollups: min/max/avg every 1 minute.
- Hourly rollups: min/max/avg/energy delta every 1 hour.

For 50 UPS units at 5-second raw intervals, this is about 864,000 telemetry rows per day. That is manageable with partitioning and retention, but rollups are still important.

## 5. Database Model

Core tables:

- `users`
- `roles`
- `user_sessions`
- `sites`
- `ups_units`
- `devices`
- `device_credentials`
- `calibration_profiles`
- `alarm_rules`
- `telemetry_raw`
- `telemetry_1m`
- `telemetry_1h`
- `alarms`
- `alarm_events`
- `firmware_releases`
- `ota_jobs`
- `audit_log`
- `system_settings`

### UPS Identity Fields

Each UPS should support:

- UPS ID/name: `UPS-01`
- Device ID: `UPSMON-001`
- UPS serial number
- Device MAC address
- Site/building
- Floor
- Room/area
- Electrical panel/source
- UPS capacity in VA/W
- Battery nominal voltage
- Battery type/count, optional
- Installation date
- Maintenance notes
- Active/inactive state

## 6. Roles And Permissions

Recommended roles:

- `manufacturer_admin`: full system control, retention settings, firmware releases, calibration templates, user management.
- `site_admin`: manage UPS records, alarm thresholds, site users, reports.
- `engineer`: view all data, acknowledge alarms, edit maintenance notes, perform calibration if allowed.
- `operator`: dashboard, alarms, acknowledge/comment only.
- `viewer`: read-only dashboard and history.

Initial implementation can use fixed credentials in environment variables, then migrate to database-backed users.

Initial fixed credentials requirement:

- Use server-side auth, not browser-only protection.
- Store password hashes or environment-provided admin password.
- Use HTTP-only session cookies.
- Protect all dashboard/admin routes.

## 7. Dashboard Requirements

### Fleet Dashboard

At-a-glance view for all UPS units:

- Total UPS count.
- Online/offline count.
- Normal/warning/critical count.
- Units currently on battery.
- Units with input failure.
- Units with output failure.
- Units near overload.
- Units with battery low/high condition.
- Alarm list sorted by severity and age.
- Search/filter by UPS ID, location, status, floor, alarm.

Each UPS row/card should show:

- UPS name and location.
- Online/offline and last seen.
- Input voltage.
- Output voltage.
- Battery voltage.
- Output current/load percentage.
- Current alarm state.

### Individual UPS Page

Each UPS page should show:

- Live values.
- Current mode inference: normal, input fail/on battery, output fail, overloaded, offline.
- Voltage/current/power trend charts.
- Battery voltage chart.
- Alarm history.
- Acknowledgment/comments.
- Device metadata.
- Calibration profile.
- Firmware version and OTA status.
- Maintenance notes.

### Analytics

Useful preventive analytics:

- Repeated input voltage low/high events.
- Output voltage instability.
- Battery voltage sag trend.
- Increased output current/load trend.
- UPS frequently switching to battery.
- Offline communication events.
- Energy usage by UPS/location.
- Top alarming UPS units.
- Daily/monthly availability report.

## 8. Alarm System

Alarm rules should support:

- Low/high input voltage.
- Low/high output voltage.
- Low/high battery voltage.
- Input failure.
- Output failure.
- Output overload.
- High input current.
- High output current.
- Bad power factor, after PF calculation is validated.
- Device offline/no data.
- Firmware outdated.
- Calibration missing.

Alarm behavior:

- Severity: info, warning, critical.
- Delay/debounce: avoid alarms on one bad sample.
- Hysteresis: avoid rapid on/off alarm flicker.
- Acknowledge/unacknowledge.
- Comment/history trail.
- Auto-clear when normal for configured duration.
- Notification routing by role/site/severity.

## 9. History And Retention

Retention should be configurable by manufacturer role.

Suggested retention presets:

- Raw telemetry: 7 days, 30 days, 90 days.
- 1-minute rollups: 6 months, 1 year.
- 1-hour rollups: 2 years or unlimited.
- Alarm history: 2 years or unlimited.
- Audit logs: 1 year or unlimited.

Implementation:

- Partition `telemetry_raw` by time.
- Run daily cleanup worker.
- Keep rollup tables before deleting raw data.
- Never delete alarm records just because telemetry retention expired, unless configured.

## 10. Firmware Plan

Detailed field installation and commissioning steps are documented in [ESP32_SITE_WORK_PLAN.md](ESP32_SITE_WORK_PLAN.md).

### Firmware Phase 1 - Production Identity And Secure Transport

- Replace public MQTT broker with private broker. Started in firmware `0.2.0`: broker is now provisioned, not hardcoded.
- Add stored `device_id`, `site_id`, and `ups_id`. Started in firmware `0.2.0`.
- Add MQTT username/password. Started in firmware `0.2.0`.
- Add topic structure per device. Started in firmware `0.2.0`.
- Publish firmware version, MAC, IP, RSSI, uptime, free heap, reset reason. Started in firmware `0.2.0` with firmware, IP, RSSI, and uptime.
- Add Last Will and Testament for offline detection.
- Add retained status message.

### Firmware Phase 2 - Measurement Quality

- Replace simple absolute-average math with calibrated RMS calculation. Started in firmware `0.3.0`.
- Add per-channel calibration:
  - ADC zero offset.
  - Scale.
  - Phase correction for CT channels.
  - Sensor type/range.
- Compute input/output apparent power. Started in firmware `0.3.0`.
- Add frequency detection from AC waveform if signal quality allows.
- Validate readings against a known meter and known load.

### Firmware Phase 3 - Real Power And Energy

- Sample voltage and corresponding current waveforms in the same window.
- Compute:
  - Vrms.
  - Irms.
  - real power watts from instantaneous `v * i`.
  - apparent power VA.
  - power factor.
  - reactive power VAR.
  - energy counters from integrated power over time.
- Persist energy counters periodically to non-volatile storage with wear protection.

### Firmware Phase 4 - OTA

Recommended OTA options:

- Local web OTA for commissioning and service. Started in firmware `0.2.0` with password-protected `/update`.
- Server-controlled HTTPS OTA for fleet updates.

OTA requirements:

- Partition scheme with OTA slots.
- Firmware version check.
- Signed or checksum-verified firmware image.
- Rollback or recovery plan.
- OTA job status reporting to backend.
- Update only when device is online and power condition is acceptable.

### Firmware Phase 5 - Reliability

- Hardware/software watchdog.
- Offline buffer for short network outages.
- Config versioning.
- Remote reboot command with role protection.
- Factory reset procedure.
- Commissioning AP with temporary password.

## 11. Web And Backend Implementation Plan

### Milestone 1 - Convert Demo To Multi-UPS Local App

- Add UPS inventory data model in the frontend.
- Simulate or ingest multiple UPS topics.
- Build fleet dashboard.
- Build individual UPS page.
- Build add/edit/remove UPS forms.
- Build fixed credential login.

### Milestone 2 - Add Backend And Database

- Add PostgreSQL.
- Add backend API routes.
- Store UPS units and telemetry.
- Move calibration and thresholds from localStorage to database.
- Add server-side alarm evaluation.
- Add persistent sessions and roles.

### Milestone 3 - Private MQTT Ingestion

- Deploy Mosquitto. Started with `deployment/docker-compose.yml` and `deployment/mosquitto/`.
- Add backend MQTT subscriber. Started with JSON-backed ingestion.
- Save telemetry into database. Pending; current bridge stores latest/history in JSON.
- Stop browser from connecting directly to device MQTT topics. Pending; dashboard currently supports both server polling and browser MQTT.
- Use WebSocket/SSE/API polling from backend to dashboard.

### Milestone 4 - Production Firmware

- Add device identity.
- Add secure MQTT credentials.
- Add improved telemetry payload.
- Add OTA.
- Add calibration command/config sync.

### Milestone 5 - Reporting And Preventive Analytics

- Add charts with selectable ranges.
- Add CSV/PDF export.
- Add daily/monthly reports.
- Add alarm frequency and trend reports.
- Add maintenance notes and audit trail.

## 12. Security Requirements

- No public MQTT broker in production.
- No hardcoded shared production credentials in firmware source.
- Use per-device MQTT credentials where possible.
- Backend validates device identity.
- HTTPS for web app.
- Role-based access for admin actions.
- Audit log for login, UPS edits, threshold edits, calibration edits, alarm acknowledgment, OTA jobs.
- Backups for database.

## 13. Calibration And Commissioning Workflow

For each installed UPS:

1. Flash initial firmware over USB.
2. Connect to setup AP.
3. Configure WiFi/static IP if needed.
4. Assign device ID and UPS identity.
5. Configure MQTT credentials.
6. Register device in dashboard.
7. Calibrate voltage using trusted meter.
8. Calibrate CT using known load/clamp meter.
9. Set UPS rating and alarm thresholds.
10. Confirm live telemetry and alarm behavior.
11. Enable OTA for future updates.

## 14. Immediate Next Steps

Recommended next implementation order:

1. Create a professional repo structure:
   - `firmware/ups_monitor/`
   - `web-dashboard/`
   - `docs/`
   - `deployment/`
2. Move `VOLTAGETEST.ino` into firmware folder without changing behavior first. Done: `firmware/ups_monitor/ups_monitor.ino`.
3. Add `.env.example` files and remove public/demo credentials from source.
4. Build fixed-credential login for the web dashboard.
5. Replace single-module dashboard state with multi-UPS inventory.
6. Add forms to add/edit/remove UPS.
7. Add individual UPS detail page.
8. Add backend/database plan implementation.
9. Add MQTT ingestion service.
10. Upgrade firmware payload and topic structure.
11. Add OTA.

## 15. Research Notes And Source References

Research checked on 2026-05-20:

- Espressif ESP-IDF OTA documentation: https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/ota.html
- Arduino ESP32 OTA web update documentation: https://docs.espressif.com/projects/arduino-esp32/en/latest/ota_web_update.html
- Eclipse Mosquitto authentication documentation: https://mosquitto.org/documentation/authentication-methods/
- PostgreSQL table partitioning documentation: https://www.postgresql.org/docs/current/static/ddl-partitioning.html
- Grafana MQTT data source documentation, useful reference for live MQTT visualization patterns: https://grafana.com/docs/plugins/grafana-mqtt-datasource/latest/
