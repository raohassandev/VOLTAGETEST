# UMS Operator Guide

> **⚠️ Version notice:** This guide was written for firmware v0.5.2. Current firmware is **v2.1.0**.
> MQTT topic is now `ums/devices/<device_id>/data`. Canonical firmware: `firmware/VOLTAGETEST/VOLTAGETEST.ino`.

**Version:** firmware v0.5.2 / Dashboard r01a50b5 (see v2.1.0 release notes for current version)

---

## Overview

The UPS Monitoring System (UMS) provides real-time visibility of UPS units across a site. Each UPS has an ESP32 monitoring module that publishes telemetry over WiFi to a central MQTT broker. The dashboard collects and displays this data.

---

## Daily Use

### Checking the Fleet

Open the dashboard at `http://<server>:3000`.

The fleet page shows all registered UPS units with:

| Column | Meaning |
|--------|---------|
| Status | Green dot = online, red = offline |
| Last seen | Time of most recent telemetry |
| volt_in | Input mains voltage (VAC) |
| volt_out | Output voltage to load (VAC) |
| volt_dc | Battery voltage (VDC) |
| Load | Estimated apparent load as % of rated capacity |
| RSSI | WiFi signal strength |
| Alarms | Active alarm count |

A grey "offline" badge means no telemetry received for more than 60 seconds.

### Investigating a UPS

Click any UPS row to open the detail page. The detail page shows:

- **Live readings:** current voltage, current, apparent power
- **24-hour chart:** voltage and load history
- **Commissioning status:** firmware version, WiFi mode, config mode, heap, RSSI
- **Physical location:** building, floor, section, work area, location, installer note
- **Active alarms**

If a field shows `—`, the device did not report that value. This is normal for older firmware or if the field was not configured.

### Checking Alarms

Navigate to `/alarms` to see all active and recently cleared alarms.

| Severity | Meaning |
|----------|---------|
| WARNING | Value crossed a warning threshold — investigate at next opportunity |
| CRITICAL | Value crossed a critical threshold — act promptly |

Alarms clear automatically when the value returns to normal for the configured hysteresis and debounce period.

---

## Understanding Measurements

| Field | Unit | Description |
|-------|------|-------------|
| `volt_in` | VAC | AC input voltage from mains |
| `volt_out` | VAC | AC output voltage to load |
| `volt_dc` | VDC | Battery bank DC voltage |
| `ct_in` | A | Input AC current (RMS via current transformer) |
| `ct_out` | A | Output AC current (RMS via current transformer) |
| `s_in_va` | VA | Apparent input power (volt_in × ct_in) |
| `s_out_va` | VA | Apparent output power (volt_out × ct_out) |
| Load % | % | s_out_va / rated capacity VA |

**Energy analyzer fields (v2.1.0):**

- Active power (W), power factor, reactive power (VAr), energy (kWh), frequency (Hz) — measured by v2.1.0 firmware.
- Fields show `—` when the channel has insufficient signal or calibration has not been performed.
- Accuracy requires reference-meter calibration. See `docs/CALIBRATION_GUIDE.md`.

---

## Alarm Defaults

| Metric | Warning threshold | Critical threshold |
|--------|------------------|--------------------|
| Input voltage | < 200 V or > 245 V | < 180 V or > 255 V |
| Output voltage | < 210 V or > 245 V | < 200 V or > 255 V |
| Battery voltage | < 91.7% of nominal | < 87.5% of nominal |
| Input current | > 28 A | > 32 A |
| Output current | > 28 A | > 32 A |
| Output load | > 80% capacity | > 95% capacity |
| Offline | — | No message for > 60 s |

Battery thresholds are percentages of the `batteryNominalV` set in inventory (e.g., for a 48V bank: warning < 44.0 V, critical < 42.0 V).

Thresholds can be customised per device, UPS unit, site, or globally at `/admin/alarm-rules`.

---

## Adding a New UPS

1. Flash firmware to a new ESP32 module (see installer checklist).
2. Commission the board (WiFi, MQTT, identity via the AP portal).
3. In the dashboard, navigate to **Inventory** (`/admin/inventory`).
4. Click **Add UPS** and fill in all fields.
5. The device will appear in the fleet once it publishes its first telemetry message.

---

## Removing a UPS

1. In the dashboard, navigate to **Inventory**.
2. Find the UPS and click **Delete**.
3. Historical telemetry data is retained in the database. To remove it, contact the administrator.

---

## Configuring a Device Remotely

Access the device's commissioning portal at `http://<device-ip>/config`.

If the device IP is unknown, find it in the dashboard commissioning status panel or check your router's DHCP client list.

If the device is not reachable on the LAN, it may have fallen back to AP mode. Connect to `UMS-SETUP-<last4MAC>` using password `UMSSetup2026` and open `http://192.168.4.1`.

---

## OTA Firmware Update

1. Obtain the new firmware binary.
2. Navigate to `http://<device-ip>/update`.
3. Enter the OTA password (default: `UMSSetup2026`; change this after commissioning).
4. Upload the `.bin` file.
5. The device reboots automatically. Wait 30 seconds, then confirm the firmware version in the dashboard commissioning status.
6. All settings (WiFi, MQTT, calibration, identity) are preserved across OTA updates.

---

## Troubleshooting

### Device shows offline in dashboard

1. Check the device is powered and the LED is active.
2. Find the device IP and open `http://<ip>/data` — if this loads, the board is reachable.
3. Check `mqtt_connected` in the `/data` response. If false, check broker connectivity and credentials.
4. Check MQTT worker logs for error messages.
5. Verify the MQTT topic in the device config matches the worker subscription pattern (`building/+/ups/+/telemetry`).

### Device shows `config_mode: true`

The board could not connect to the configured WiFi network and has fallen back to AP mode. Causes:
- Wrong WiFi password
- WiFi SSID changed
- Board moved out of WiFi range
- Access point rebooted and is temporarily unavailable

Connect to the board's AP (`UMS-SETUP-xxxx`) and reconfigure WiFi.

### Readings look wrong (voltage 0, or far from mains nominal)

- Check sensor wiring (voltage divider, CT clamp).
- Check if calibration coefficients were accidentally set to 0 — a zero scale is rejected by the firmware, but if the board was flashed fresh it will use defaults (1.0 scale, 0.0 offset).
- Compare with a reference meter and recalibrate (see `docs/CALIBRATION_GUIDE.md`).

### Dashboard login not working

- Default username: `admin` (or as configured in `.env`).
- If `ALLOW_DEV_AUTH=true` is set in `.env`, use the cookie method described in the deployment guide.
- In production, a bcrypt password hash is required. Contact the system administrator to reset the password hash.

---

## Backup and Recovery

The system administrator is responsible for scheduling backups using:

```bash
bash deployment/scripts/backup.sh
```

This creates a PostgreSQL dump. To restore, see `docs/DEPLOYMENT_GUIDE.md`.

**What is backed up:** database (telemetry, devices, alarms, alarm rules, settings).  
**What is not backed up:** firmware binaries (rebuild from source), dashboard configuration in `.env` (store separately, never in git).

---

## Security Notes

- Change the AP password from `UMSSetup2026` after commissioning.
- Change the OTA password from the default after commissioning.
- Use MQTT credentials on the broker in production.
- Rotate the `UPS_AUTH_TOKEN` in the dashboard environment if a session credential is compromised.
- Do not expose the dashboard or MQTT broker directly to the internet without a VPN or firewall.
