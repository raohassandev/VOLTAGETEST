# ESP32 Site Work Plan

## 1. Purpose

This document defines the practical site work required to install, commission, calibrate, maintain, and update ESP32 UPS monitoring modules across approximately 50 UPS units in a large building.

The goal is to make field installation repeatable. Every installed module should have a known identity, known wiring, verified readings, secure communication, and a clear recovery path.

## 2. Site Work Scope

For each UPS location, the site team must handle:

- Physical module mounting.
- AC voltage sensing connections for UPS input and output.
- CT placement for UPS input and output current.
- Battery voltage sensing terminal connection.
- ESP32 power supply.
- WiFi/network provisioning.
- Device identity assignment.
- Dashboard registration.
- Calibration and validation.
- OTA readiness.
- Final handover record.

## 3. Hardware Preparation Before Site Visit

Each ESP32 monitoring unit should be prepared before installation:

- Flash baseline firmware over USB.
- Confirm firmware version.
- Confirm partition scheme supports OTA.
- Assign temporary factory device ID or QR label.
- Label enclosure with device ID and MAC address.
- Verify setup AP works.
- Verify ADC channels respond to test signals.
- Verify MQTT connection on test network.
- Verify local web configuration page.
- Verify watchdog/reboot behavior.

Recommended label fields:

- Device ID: configured via firmware portal (e.g. `UMS-3076F5A5AD54` or site scheme `UPSMON-B1-01`)
- MAC address
- Hardware revision
- Firmware version (v1.0.0)
- QR code linking to dashboard device record, later phase

## 4. Electrical Safety And Installation Notes

This system touches 230 VAC sensing and UPS battery terminals. Site work must be performed by qualified electrical personnel.

Requirements:

- Use isolated voltage sensing circuits suitable for 230 VAC.
- Enclose all live terminals.
- Add fusing/protection where appropriate.
- Maintain clearance and creepage distances.
- Never expose ESP32 low-voltage circuitry directly to mains.
- Confirm CT orientation with marked source/load direction.
- Use proper terminal blocks, ferrules, strain relief, and cable marking.
- Keep analog sensor wiring away from noisy power wiring where possible.

## 5. Wiring Plan Per UPS

### Inputs

| Signal | Source | Firmware Channel | Field Check |
| --- | --- | --- | --- |
| Battery DC voltage | UPS battery terminal/sensing output | GPIO34 / ADC1_CH6 | Compare with multimeter |
| Output AC voltage | UPS output sensing circuit | GPIO35 / ADC1_CH7 | Compare with true RMS meter |
| Input AC voltage | UPS input sensing circuit | GPIO32 / ADC1_CH4 | Compare with true RMS meter |
| Input CT | UPS input conductor | GPIO36 / ADC1_CH0 | Compare with clamp meter |
| Output CT | UPS output conductor | GPIO39 / ADC1_CH3 | Compare with clamp meter |

### CT Installation

- Place CT around one conductor only, not both live and neutral.
- Confirm CT rating matches expected UPS load.
- Confirm burden resistor and signal conditioning are correct.
- Mark CT direction.
- Record CT ratio in the calibration sheet.

## 6. Device Identity Plan

Each physical monitoring module and each UPS must be separately identifiable.

Recommended IDs:

- Device ID: configured via firmware portal (e.g. `UPSMON-B1-01`), assigned to ESP32 hardware.
- UPS ID: `UPS-B1-01`, assigned to the UPS asset.
- Site ID: `SITE-01`, assigned to the building/project.

The dashboard must store:

- Device ID
- UPS ID/name
- UPS serial number
- Location/floor/room
- UPS capacity
- Battery nominal voltage
- Device MAC address
- Firmware version
- Installer name
- Installation date
- Calibration date

## 7. Network Commissioning

Recommended production approach:

- Use private MQTT broker.
- Use per-device MQTT username/password.
- Use fixed IP only if the building network requires it.
- Prefer DHCP reservation from router/firewall when available.
- Keep setup AP enabled only during commissioning, or protect it with a temporary password.

Commissioning steps:

1. Power the module.
2. Connect to setup AP if device is not already provisioned.
3. Configure WiFi SSID/password.
4. Configure DHCP or static IP.
5. Configure MQTT host, port, username, password, and site ID.
6. Save and reboot.
7. Confirm module appears online in dashboard.
8. Record RSSI and IP address.

Signal quality target:

- Good: RSSI better than `-65 dBm`.
- Acceptable: `-65` to `-75 dBm`.
- Risky: worse than `-75 dBm`; consider access point placement or wired gateway alternative.

## 8. Calibration Workflow

Calibration must be done per installed UPS because sensors, CTs, wiring, and ADC offsets vary.

### Voltage Calibration

For input and output AC:

1. Measure actual RMS voltage using a trusted true RMS meter.
2. Read raw/calculated ESP32 value.
3. Apply scale and offset.
4. Repeat at another load/time if possible.
5. Store calibration in dashboard and/or device config.

For battery DC:

1. Measure battery voltage with a multimeter.
2. Read ESP32 battery value.
3. Apply scale and offset.
4. Confirm alarm thresholds match battery bank nominal voltage.

### Current Calibration

For each CT:

1. Measure actual current using a clamp meter.
2. Read ESP32 current value.
3. Apply CT scale.
4. Test at low and medium load if possible.
5. Confirm zero reading with no load.

### Calibration Record

Record:

- Reference meter used.
- Raw ESP32 reading.
- Actual measured value.
- Scale.
- Offset.
- Technician.
- Date/time.
- Notes.

## 9. OTA Site Plan

OTA should be introduced in two stages.

### Stage 1 - Local Web OTA

Use for early site commissioning and service visits.

Requirements:

- `/update` page protected by password.
- Firmware binary upload.
- Version display before and after update.
- Reboot after successful update.
- Failure message on invalid firmware.

### Stage 2 - Fleet OTA

Use after backend and device identity are stable.

Requirements:

- Firmware releases stored on server.
- OTA jobs assigned to selected devices.
- Device checks signed/versioned update manifest.
- Device downloads firmware over HTTPS.
- Device reports status: pending, downloading, installed, failed, rolled back.
- Backend shows OTA history.

OTA safety rules:

- Do not update while device has unstable power.
- Do not update all 50 devices at once at first.
- Start with one test device, then a small group, then fleet rollout.
- Keep USB recovery possible.

## 10. Alarm Threshold Defaults

Initial defaults must be reviewed with the UPS manufacturer/site engineer.

Suggested starting values for 230 VAC systems:

- Input voltage low warning: 200 VAC.
- Input voltage critical low: 180 VAC.
- Input voltage high warning: 245 VAC.
- Input voltage critical high: 255 VAC.
- Output voltage low warning: 210 VAC.
- Output voltage critical low: 200 VAC.
- Output voltage high warning: 245 VAC.
- Output voltage critical high: 255 VAC.
- Output overload warning: 80% of configured UPS rating.
- Output overload critical: 95% of configured UPS rating.
- Device offline: no telemetry for 30 seconds to 2 minutes, depending on publish interval.

Battery thresholds depend on battery bank voltage and chemistry. Configure per UPS model.

## 11. Acceptance Checklist Per UPS

Before handover, each UPS installation must pass:

- Device mounted securely.
- Wiring labeled and enclosed.
- Input voltage reading matches reference meter within agreed tolerance.
- Output voltage reading matches reference meter within agreed tolerance.
- Battery voltage reading matches reference meter within agreed tolerance.
- Input CT reading matches clamp meter within agreed tolerance.
- Output CT reading matches clamp meter within agreed tolerance.
- Device appears online in dashboard.
- Correct UPS name, serial, and location are shown.
- Alarm thresholds configured.
- Offline alarm tested by disconnecting network or stopping telemetry.
- OTA path confirmed on at least one pilot unit.
- Site record completed.

## 12. Field Data Sheet

Minimum fields to collect on site:

```text
UPS ID:
UPS serial:
Location/floor/room:
UPS capacity:
Battery nominal voltage:
Device ID:
MAC address:
IP address:
RSSI:
Firmware version:
Input voltage reference:
Input voltage displayed:
Output voltage reference:
Output voltage displayed:
Battery voltage reference:
Battery voltage displayed:
Input current reference:
Input current displayed:
Output current reference:
Output current displayed:
Installer:
Date:
Notes:
```

## 13. Pilot Rollout Plan

Do not install all 50 units immediately.

Recommended rollout:

1. Bench test 2 modules.
2. Install 1 pilot UPS.
3. Run for 48 to 72 hours.
4. Validate readings, alarms, WiFi stability, and dashboard behavior.
5. Install 5 UPS units in one area.
6. Run for one week.
7. Finalize calibration workflow and thresholds.
8. Roll out remaining UPS units in batches.

## 14. Open Technical Decisions

Before production deployment, decide:

- Exact voltage sensing hardware and isolation design.
- CT model, CT ratio, burden resistor, and expected current range.
- Whether active/reactive power is mandatory in phase 1.
- Whether to keep Arduino framework or move firmware to ESP-IDF/PlatformIO.
- Whether the site network allows MQTT outbound directly from devices.
- Whether a local building server/VPS/cloud server will host the backend.
- Whether notifications will use email, SMS, WhatsApp, or local annunciation first.
