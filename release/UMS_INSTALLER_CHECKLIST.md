# UMS Installer Checklist

**Version:** firmware v0.5.2 / Dashboard r01a50b5  
**Device ID:** ___________________  
**UPS ID:** ___________________  
**Site:** ___________________  
**Date:** ___________________  
**Installer:** ___________________

---

## 1. Board Flash

- [ ] Obtained firmware binary `ups_monitor_v0.5.2.bin` or built from source (see `release/firmware/README.md`)
- [ ] Connected ESP32 to PC via USB
- [ ] Identified correct COM port
- [ ] Flashed firmware:
  ```bash
  arduino-cli upload -p <COM_PORT> --fqbn esp32:esp32:esp32 firmware/ups_monitor
  ```
  Or via OTA at `http://<device-ip>/update` if upgrading an existing device
- [ ] Serial monitor confirmed boot (921600 baud): `Starting UMS firmware v0.5.2`
- [ ] AP `UMS-SETUP-<last4MAC>` appeared after first boot

---

## 2. First-Boot AP Setup

- [ ] Connected phone/laptop to `UMS-SETUP-xxxx` with password `UMSSetup2026`
- [ ] Opened `http://192.168.4.1` — commissioning portal loaded
- [ ] Confirmed firmware version shown: `0.5.2`

---

## 3. Board Identity Configuration (`/config`)

- [ ] Device ID set: `___________________` (unique per ESP32 module)
- [ ] UPS ID set: `___________________` (unique per UPS unit, matches dashboard registration)
- [ ] Site ID set: `___________________`
- [ ] Building: `___________________`
- [ ] Floor: `___________________`
- [ ] Section: `___________________`
- [ ] Work area: `___________________`
- [ ] Location (precise): `___________________`
- [ ] Installer note filled: `___________________`

---

## 4. WiFi Setup

- [ ] WiFi SSID configured: `___________________`
- [ ] WiFi password set
- [ ] IP mode selected:
  - [ ] DHCP (recommended for initial commissioning)
  - [ ] Static IP: `___________________`
- [ ] If static: gateway `___________` subnet `___________` DNS `___________`
- [ ] `Keep setup AP always enabled` — checked only during commissioning, **unchecked before handover**
- [ ] Saved and rebooted
- [ ] Board connected to WiFi — confirmed via serial or `/data` endpoint
- [ ] AP stopped after STA connected (if `setup_ap_always` off) — confirmed

---

## 5. MQTT Setup

- [ ] Broker host set: `___________________` (LAN IP or hostname, not localhost)
- [ ] Port set: `1883`
- [ ] MQTT username set (if broker requires auth)
- [ ] MQTT password set
- [ ] Topic set: `building/<site-id>/ups/<device-id>/telemetry`
  - Full topic: `___________________`
- [ ] Publish interval set: `5` seconds (or as required)
- [ ] Saved and rebooted
- [ ] MQTT publishing confirmed — worker logs show received messages

---

## 6. Dashboard Inventory Registration

- [ ] Logged in to dashboard at `http://<server>:3000`
- [ ] Navigated to **Inventory** (`/admin/inventory`)
- [ ] Clicked **Add UPS** and filled in:
  - UPS ID (must match `ups_id` set on board): `___________________`
  - Device ID (must match `device_id` set on board): `___________________`
  - Name / Label: `___________________`
  - Serial number: `___________________`
  - Site: `___________________`
  - Location: `___________________`
  - Capacity VA: `___________________`
  - Battery nominal V: `___________________`
- [ ] Saved inventory record

---

## 7. Dashboard Verification

- [ ] Device appears in fleet page within 30 seconds
- [ ] `online` status shown
- [ ] `volt_in` reading is plausible (~230 VAC nominal)
- [ ] `volt_out` reading is plausible
- [ ] `volt_dc` reading matches battery bank voltage
- [ ] `ct_in` / `ct_out` not zero under load
- [ ] `rssi` above −75 dBm (lower = weaker signal — consider relocating device or adding AP)
- [ ] `config_mode: false` shown in commissioning status
- [ ] `setup_ap_enabled: false` confirmed in commissioning status (after disabling always-on AP)
- [ ] `firmware: 0.5.2` confirmed
- [ ] `mqtt_connected: true`
- [ ] No alarms triggered incorrectly (check `/alarms`)

---

## 8. OTA Test (optional at commissioning, recommended before handover)

- [ ] Navigated to `http://<device-ip>/update`
- [ ] Entered OTA password
- [ ] Uploaded test firmware (or same binary to confirm OTA path works)
- [ ] Device rebooted and returned with expected firmware version
- [ ] All settings preserved after OTA

---

## 9. Calibration

- [ ] Raw readings compared against reference instrument
- [ ] Calibration coefficients set if deviation exceeds tolerance (see `docs/CALIBRATION_GUIDE.md`)
- [ ] Calibration record filled in field test report
- [ ] Post-calibration readings verified within tolerance

Calibration status: [ ] Not required (within 5% tolerance)  / [ ] Calibrated (see field test report)

---

## 10. Burn-In (Minimum 2 Hours)

- [ ] Device left running for 2 hours minimum
- [ ] No firmware reboots observed
- [ ] Telemetry `seq` counter increasing throughout
- [ ] `free_heap` stable (not continuously decreasing)
- [ ] Worker stayed running
- [ ] Dashboard remained reachable
- [ ] No false alarms

Burn-in result: [ ] Pass  /  [ ] Fail — see notes

---

## Handover Checklist

- [ ] `setup_ap_always` unchecked (AP off in production mode)
- [ ] OTA password changed from default
- [ ] AP password changed from `UMSSetup2026`
- [ ] Dashboard admin password is production-strength bcrypt hash
- [ ] MQTT credentials set and non-default
- [ ] Inventory record complete with serial number and capacity
- [ ] Field test report filled out and filed
- [ ] Installer note updated with date and name

---

## Notes

_______________________________________________  
_______________________________________________  
_______________________________________________

**Signed off by:** ___________________  **Date:** ___________________
