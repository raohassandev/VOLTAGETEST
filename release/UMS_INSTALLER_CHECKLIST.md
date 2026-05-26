# UMS Installer Checklist - v2.1.0

**Firmware:** v2.1.0  
**Canonical source:** `firmware/VOLTAGETEST/VOLTAGETEST.ino`  
**OTA binary:** `release/firmware/v2.1.0/VOLTAGETEST-v2.1.0.merged.bin`  
**MQTT topic:** `ums/devices/<device_id>/data`  
**Publish interval:** 1 second

**Device ID:** ___________________  
**UPS ID:** ___________________  
**Site:** ___________________  
**Date:** ___________________  
**Installer:** ___________________

## Licensing

- [ ] `UMS_LICENSE_ENFORCEMENT=enabled` is set in production.
- [ ] `UMS_LICENSE_PUBLIC_KEY_PEM` contains only the Automatrix public key.
- [ ] Private signing keys are not present on the UMS server.
- [ ] Machine code from `Admin > License` was provided to Automatrix.
- [ ] Activation JSON was installed and seat count matches the active UPS plan.

## 1. Flash Firmware

- [ ] Connected ESP32 to PC via USB.
- [ ] Identified correct COM port.
- [ ] Built or obtained the v2.1.0 firmware binary.
- [ ] Flashed with Arduino CLI:

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/VOLTAGETEST
arduino-cli upload -p <COM_PORT> --fqbn esp32:esp32:esp32 firmware/VOLTAGETEST
```

- [ ] Or uploaded OTA binary through `http://<device-ip>/update`.
- [ ] Confirmed AP `UMS-SETUP-<last4MAC>` appears on first boot or WiFi failure.

## 2. First-Boot Setup

- [ ] Connected to setup AP.
- [ ] Opened `http://192.168.4.1`.
- [ ] Confirmed `/api/info` returns firmware `2.1.0`.
- [ ] Confirmed `/data` loads and includes `device_id`, `firmware`, voltage fields, and MQTT status fields.

## 3. Identity

- [ ] Device ID set: `___________________`
- [ ] UPS ID set: `___________________`
- [ ] Site ID set: `___________________`
- [ ] Building/floor/section/work area/location filled as required.

## 4. WiFi

- [ ] Production WiFi SSID configured.
- [ ] Production WiFi password set.
- [ ] DHCP or approved static IP configured.
- [ ] Setup AP always-on disabled before handover.
- [ ] Board reachable at `http://<device-ip>/`.

## 5. MQTT

- [ ] Broker host set to LAN/server broker, not a public test broker.
- [ ] Port set to `1883` unless deployment specifies otherwise.
- [ ] MQTT username set.
- [ ] MQTT password set.
- [ ] `/api/info` shows `mqtt_auth: true`.
- [ ] `/api/info` shows `mqtt_topic: ums/devices/<device_id>/data`.
- [ ] Dashboard worker subscribes to `ums/devices/+/data`.
- [ ] MQTT messages observed in worker logs.

## 6. Dashboard Inventory

- [ ] Logged in to dashboard.
- [ ] Added UPS inventory record.
- [ ] UPS ID matches board `ups_id`.
- [ ] Device ID matches board `device_id`.
- [ ] Capacity VA and battery nominal voltage are correct.
- [ ] Physical location and serial number are recorded.

## 7. Dashboard Verification

- [ ] Device appears online within the configured offline threshold.
- [ ] UPS detail page opens.
- [ ] Firmware shows `2.1.0`.
- [ ] `volt_in`, `volt_out`, `volt_dc`, `ct_in`, and `ct_out` are plausible.
- [ ] W/PF/kWh/Q/Hz fields show values or `Not available` when signal/calibration is unavailable.
- [ ] RSSI is acceptable for the site.
- [ ] No false alarms are active.
- [ ] LAN scan discovers the board.

## 8. Calibration

- [ ] Input voltage calibrated against reference meter.
- [ ] Output voltage calibrated against reference meter.
- [ ] Battery voltage calibrated against DMM.
- [ ] Input/output CT channels calibrated under known load.
- [ ] W/PF/kWh validated against reference meter where available.
- [ ] Calibration record filed.

## 9. Burn-In

- [ ] Device ran for at least 2 hours.
- [ ] `seq` increased continuously.
- [ ] No unexpected reboots.
- [ ] Worker and dashboard stayed healthy.
- [ ] No false alarms.

## Handover

- [ ] Setup AP disabled unless explicitly required.
- [ ] OTA password changed from default.
- [ ] MQTT credentials are non-default.
- [ ] Dashboard production auth is configured with bcrypt hash and strong token.
- [ ] Field test report completed.

**Signed off by:** ___________________  **Date:** ___________________
