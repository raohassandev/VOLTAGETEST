# UMS Field Test Report

> **⚠️ Version notice:** Template written for v0.5.2. Update template header to v2.1.0 before use.

**Template version:** v0.5.2 (update to v2.1.0 before use)

---

## Device Identity

| Field | Value |
|-------|-------|
| UPS ID | |
| Device ID | |
| MAC address | |
| Firmware version | |
| Board serial / label | |
| Test date | |
| Tested by | |
| Site | |
| Building | |
| Floor | |
| Section | |
| Work area | |
| Location (precise) | |

---

## Network Status

| Field | Value |
|-------|-------|
| IP address | |
| IP mode (DHCP / Static) | |
| WiFi SSID | |
| WiFi RSSI (dBm) | |
| RSSI acceptable? (> −75 dBm) | Yes / No |
| wifi_mode | STA / AP / AP+STA |
| mqtt_connected | true / false |
| config_mode | false ✓ / true ✗ |
| setup_ap_enabled | false ✓ / true (check if intended) |

---

## Firmware Health

| Field | Value |
|-------|-------|
| seq (sequence counter) | |
| free_heap (bytes) | |
| reset_reason | |
| uptime at time of test | |

---

## Measurement Readings vs. Reference

Record dashboard value and reference instrument reading for each channel.

### Voltage

| Channel | Dashboard (V) | Reference DMM (V) | Error (%) | Pass? |
|---------|--------------|------------------|-----------|-------|
| volt_in | | | | |
| volt_out | | | | |
| volt_dc | | | | |

Tolerance: ±2% voltage, ±1% battery DC

### Current

Apply a known steady load for current measurements.

| Channel | Dashboard (A) | Reference Clamp (A) | Error (%) | Pass? |
|---------|--------------|---------------------|-----------|-------|
| ct_in | | | | |
| ct_out | | | | |

Tolerance: ±5% current

### Apparent Power

| Channel | Dashboard (VA) | Expected (VA) | Error (%) | Pass? |
|---------|---------------|--------------|-----------|-------|
| s_in_va | | | | |
| s_out_va | | | | |

Expected VA = reference V × reference A (for test load)

---

## Calibration Values Applied

| Parameter | Scale | Offset |
|-----------|-------|--------|
| V-In | | |
| V-Out | | |
| V-Batt | | |
| I-In | | |
| I-Out | | |
| AC Zero | | n/a |

Reference instrument: _________________  
Last calibration date of reference instrument: _________________

Calibration status: [ ] Not required  /  [ ] Calibrated  /  [ ] Unable to calibrate (see notes)

---

## MQTT Status

| Check | Result |
|-------|--------|
| Worker receiving messages | Yes / No |
| Telemetry visible in dashboard | Yes / No |
| Device shows online in fleet page | Yes / No |
| TelemetryRaw rows increasing | Yes / No |
| TelemetryLatest updated | Yes / No |

---

## Alarm Status

| Check | Result |
|-------|--------|
| No false alarms at time of test | Yes / No |
| Alarm rules reviewed and appropriate | Yes / No |
| Active alarms at time of test | None / List: |

---

## Tests Performed

| Test | Result | Notes |
|------|--------|-------|
| Board powered on — AP appeared | Pass / Fail | |
| WiFi connected (STA) | Pass / Fail | |
| AP off after STA connected | Pass / Fail | |
| `/data` endpoint accessible | Pass / Fail | |
| MQTT publishing confirmed | Pass / Fail | |
| Dashboard shows live telemetry | Pass / Fail | |
| OTA upload test | Pass / Fail / Skipped | |
| Factory reset test | Pass / Fail / Skipped | |
| Alarm triggers at threshold | Pass / Fail / Skipped | |
| Burn-in duration | hours | |

---

## Burn-In Log (2-hour minimum)

| Time | seq | free_heap | RSSI | volt_in | volt_dc | Alarms | Worker | Notes |
|------|-----|----------|------|---------|---------|--------|--------|-------|
| T+0 | | | | | | | | |
| T+15 min | | | | | | | | |
| T+30 min | | | | | | | | |
| T+45 min | | | | | | | | |
| T+60 min | | | | | | | | |
| T+75 min | | | | | | | | |
| T+90 min | | | | | | | | |
| T+105 min | | | | | | | | |
| T+120 min | | | | | | | | |

Burn-in result: [ ] Pass (no crashes, seq increasing, heap stable)  /  [ ] Fail

---

## Overall Result

| Category | Pass / Fail |
|----------|------------|
| Identity configured | |
| Network stable | |
| MQTT publishing | |
| Measurements within tolerance | |
| Dashboard live | |
| Alarms correct | |
| Burn-in | |
| **Overall** | |

---

## Notes and Issues

_______________________________________________  
_______________________________________________  
_______________________________________________  
_______________________________________________

---

## Sign-off

**Installer:** ___________________  **Date:** ___________________

**Reviewed by:** ___________________  **Date:** ___________________
