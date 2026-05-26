# Commissioning Guide — UPS Monitoring System

> **v2.1.0 — Updated for current firmware.**
> Canonical firmware: `firmware/VOLTAGETEST/VOLTAGETEST.ino`
> MQTT topic: `ums/devices/<device_id>/data`

---

## Step 1 — Flash the Firmware

1. Open `firmware/VOLTAGETEST/VOLTAGETEST.ino` in Arduino IDE.
2. Install board support: `esp32 by Espressif Systems` via Boards Manager.
3. Select board: **ESP32 Dev Module** (or your specific variant).
4. Upload settings: 921600 baud, default partition scheme.
5. Flash and verify via Serial Monitor at 921600 baud.

Default publish interval is **5 seconds** (configurable via the portal).

---

## Step 2 — Connect to the Commissioning Portal

### AP Behavior (v0.5.1+)

The setup AP (`UMS-SETUP-xxxx`) operates in three modes:

| Scenario | AP Active? | Mode |
|----------|------------|------|
| No WiFi SSID configured (first boot) | **Yes** | Setup mode — AP required |
| WiFi SSID configured, STA not yet connected | No | STA connecting; AP off |
| STA connection fails after 30 seconds | **Yes** | AP fallback — bad credentials or unreachable network |
| STA connected, `setup_ap_always = OFF` (default) | **No** | STA-only — production mode |
| STA connected, `setup_ap_always = ON` | **Yes** | AP+STA — technician convenience mode |

**On first boot** (no SSID in NVS), the board starts the AP immediately:

- **SSID:** `UMS-SETUP-xxxx` where `xxxx` is the last 4 characters of the MAC address (e.g., `UMS-SETUP-A1B2`)
- **Password:** `UMSSetup2026`
- **Portal IP:** `http://192.168.4.1`

Connect to the AP using a phone or laptop, then open `http://192.168.4.1` in a browser.

> **Production recommendation:** Leave `setup_ap_always` **unchecked** (default). After commissioning, the board broadcasts STA-only with no AP. This prevents the setup AP from appearing as an unmanaged network in the building.

> **Technician convenience:** Check `Keep setup AP always enabled` in the Security section of `/config` if you need to keep the AP accessible even when the board is connected to WiFi. This is useful during installation and testing. Turn it off before handover.

---

## Step 3 — Configure via /config

Navigate to `http://192.168.4.1/config` (or click **Full Configuration** from the status page).

The configuration page has five sections:

### 3a. Board Identity

Set unique identifiers that match your site plan:

| Field | Example | Notes |
|-------|---------|-------|
| Device ID | `UPSMON-B1-01` | Unique per ESP32 module — required |
| UPS ID | `UPS-B1-F2-01` | Unique per UPS unit — required |
| Site ID | `SITE-HQ` | Matches your site naming |
| Building | `Main Block` | Physical building name |
| Floor | `Ground Floor` | Floor within building |
| Section | `Server Room A` | Section/room within floor |
| Work Area | `Rack Row 3` | Specific area within section |
| Location | `Rack 3, Unit 12` | Precise physical location |
| Installer Note | `Installed 2026-05-20` | Free text for field notes |

These fields are transmitted in every MQTT payload. Use them to locate a device in the field without needing to look up the dashboard.

### 3b. Network / WiFi

| Field | Notes |
|-------|-------|
| WiFi SSID | Building network SSID |
| WiFi Password | Leave blank to keep existing |
| IP Mode | DHCP (recommended) or Static |
| Static IP / Gateway / Subnet / DNS1 / DNS2 | Only required if Static selected |

Static IP fields are hidden when DHCP is selected. They appear automatically when you switch to Static mode.

### 3c. MQTT

| Field | Value |
|-------|-------|
| Broker Host | IP or hostname of your MQTT broker |
| Port | 1883 (default) |
| Username | MQTT credential (leave blank if no auth) |
| Password | MQTT credential — leave blank to keep existing |
| Topic | `ums/devices/UPSMON-B1-01/data` |
| Publish Interval | 1000 ms (fixed in v2.1.0) |

> **Topic convention (v2.1.0):** `ums/devices/<device-id>/data`
> The dashboard MQTT worker subscribes to `ums/devices/+/data`.

### 3d. Security

| Field | Notes |
|-------|-------|
| AP Password | Password to join the `UMS-SETUP-xxxx` AP — leave blank to keep existing |
| OTA Password | Password required for firmware update at `/update` — leave blank to keep existing |
| Keep setup AP always enabled | Checkbox — keep AP broadcasting even when STA is connected |

Password fields always appear blank. If you submit them blank, the existing saved value is preserved.

**`Keep setup AP always enabled` checkbox:**
- **Unchecked (default / production):** AP starts only when no SSID is configured or after STA connection failure. Turns off automatically when STA connects.
- **Checked:** AP remains active regardless of STA status. Useful during installation. **Disable before handover.**

### 3e. Advanced Calibration (collapsible)

Default coefficients (scale=1.0, offset=0.0) are suitable for initial deployment.
Adjust only after comparing measured values to a calibrated reference instrument.

---

## Step 4 — Save and Reboot

After filling in the form, click **Save Configuration**.

The portal will confirm: *"Configuration saved successfully. Network and identity changes will take effect after a reboot."*

Click the **Reboot** button (or navigate to `/reboot`) to apply the changes.

After reboot, the board will:
1. Attempt to connect to the configured WiFi SSID.
2. **`setup_ap_always = OFF` (default):** No AP at boot. If STA connects within 30 seconds → STA-only mode (no AP broadcast). If STA fails → AP fallback starts after 30 seconds. The status page shows a banner: *"Setup/fallback AP active — STA not connected."* The board retries STA every 60 seconds automatically.
3. **`setup_ap_always = ON`:** AP starts immediately at boot alongside the STA attempt. AP stays on regardless of STA status.

---

## Step 5 — Factory Reset

To clear all saved settings and return to defaults:

1. Navigate to `http://192.168.4.1/factory-reset` (or LAN IP if connected).
2. Confirm the reset.
3. The board erases all NVS namespaces (`wifi`, `device`, `mqtt`, `cal`) and reboots.
4. After reboot, connect to `UMS-SETUP-xxxx` / `UMSSetup2026` and reconfigure from Step 3.

---

## Step 6 — Register in Dashboard

1. Log in to the dashboard at `http://<server>:3303`.
2. Navigate to **Inventory** (`/admin/inventory`).
3. Click **Add UPS** and fill in:
   - **UPS ID:** Must match the `ups_id` set in the portal (e.g., `UPS-B1-F2-01`)
   - **Device ID:** Must match the `device_id` set in the portal (e.g., `UPSMON-B1-01`)
   - **Serial:** UPS manufacturer serial number
   - **Floor / Location:** Physical location (can match the portal fields)
   - **Capacity VA:** UPS rated capacity (e.g., `3000`)
   - **Battery nominal V:** Battery bank voltage (e.g., `48` for 48V battery)
4. Click **Save UPS**.

> The `Device ID` and `UPS ID` values link the physical module to the inventory record.
> The alarm engine uses `batteryNominalV` to compute battery thresholds.

---

## Step 7 — Verify Telemetry

After a few seconds, the device should appear in the dashboard fleet table with live values.

Check:
- Input voltage is ~230 VAC (or your local mains nominal)
- Output voltage matches (UPS in bypass or online mode)
- Battery voltage matches the charger output (typically 48–54 V for a 48V bank)
- Load % is reasonable (not 0% or >100%)
- RSSI is above –75 dBm

---

## Step 8 — Default Alarm Thresholds

The system creates default alarm rules when telemetry is first received.
Review these in the admin panel or adjust via the API.

| Metric | Warning | Critical |
|--------|---------|---------|
| Input voltage | < 200V or > 245V | < 180V or > 255V |
| Output voltage | < 210V or > 245V | < 200V or > 255V |
| Battery voltage | < 91.7% nominal | < 87.5% nominal |
| Input current | > 28A | > 32A |
| Output current | > 28A | > 32A |
| Output load | > 80% capacity | > 95% capacity |
| Device offline | — | No message for > 60s |

Battery thresholds are computed relative to the `batteryNominalV` set in inventory.

---

## Step 9 — Scaling to 50 Devices

Repeat Steps 1–8 for each UPS module.

Naming convention recommendation:
- Device ID: `UPSMON-<floor>-<sequence>` e.g. `UPSMON-B1-01`
- UPS ID: `UPS-<floor>-<room>-<sequence>` e.g. `UPS-B1-IT01`
- Topic: `ums/devices/<device-id>/data`

All devices sharing a site should use the same MQTT broker.

---

## OTA Firmware Update

1. Navigate to `http://<device-ip>/update` (use AP IP `192.168.4.1` if on same LAN).
2. Enter OTA password.
3. Select the `.bin` firmware file.
4. Click Upload — device will restart automatically.

Verify the new firmware version appears in the dashboard device info.

---

## NVS Storage Reference (v0.5.0)

All settings are stored in ESP32 non-volatile storage (NVS / Preferences):

| Namespace | Key | Type | Description |
|-----------|-----|------|-------------|
| `wifi` | `ssid` | string | WiFi SSID |
| `wifi` | `pass` | string | WiFi password |
| `wifi` | `dhcp` | bool | true = DHCP, false = static |
| `wifi` | `setup_ap_always` | bool | false = AP off when STA connected (default); true = AP always on |
| `wifi` | `local_ip` | string | Static local IP |
| `wifi` | `gateway` | string | Static gateway |
| `wifi` | `subnet` | string | Static subnet mask |
| `wifi` | `dns1` | string | Primary DNS |
| `wifi` | `dns2` | string | Secondary DNS |
| `device` | `device_id` | string | Unique device identifier |
| `device` | `ups_id` | string | Linked UPS identifier |
| `device` | `site_id` | string | Site identifier |
| `device` | `building` | string | Building name |
| `device` | `floor` | string | Floor within building |
| `device` | `section` | string | Section/room |
| `device` | `work_area` | string | Work area within section |
| `device` | `location` | string | Precise physical location |
| `device` | `note` | string | Installer note |
| `device` | `ap_pass` | string | AP password |
| `device` | `ota_pass` | string | OTA password |
| `mqtt` | `server` | string | MQTT broker host |
| `mqtt` | `port` | uint16 | MQTT port (default 1883) |
| `mqtt` | `user` | string | MQTT username |
| `mqtt` | `pass` | string | MQTT password |
| `mqtt` | `topic` | string | Publish topic |
| `mqtt` | `pub_int` | uint16 | Publish interval in seconds |
| `cal` | `vi_sc` / `vi_os` | float | Input voltage cal |
| `cal` | `vo_sc` / `vo_os` | float | Output voltage cal |
| `cal` | `vb_sc` / `vb_os` | float | Battery voltage cal |
| `cal` | `ii_sc` / `ii_os` | float | Input current cal |
| `cal` | `io_sc` / `io_os` | float | Output current cal |
| `cal` | `ac_zero` | float | AC zero-crossing reference |

---

## MQTT Payload Reference (v2.1.0)

Published to `ums/devices/{device_id}/data` every 1000 ms.

```json
{
  "device_id": "UPSMON-B1-01",
  "ups_id": "UPS-B1-F2-01",
  "site_id": "SITE-HQ",
  "building": "Main Block",
  "floor": "Ground Floor",
  "section": "Server Room A",
  "work_area": "Rack Row 3",
  "location": "Rack 3, Unit 12",
  "volt_in": 231.5,
  "volt_out": 230.1,
  "volt_dc": 52.4,
  "ct_in": 4.2,
  "ct_out": 3.9,
  "s_in_va": 970.3,
  "s_out_va": 898.7,
  "freq_in": 50.0,
  "freq_out": 50.0,
  "p_in_w": 498.2,
  "p_out_w": 401.5,
  "pf_in": 0.937,
  "pf_out": 0.945,
  "q_in_var": 182.4,
  "q_out_var": 145.3,
  "e_in_kwh": 12.345,
  "e_out_kwh": 11.802,
  "rssi": -62,
  "ip": "192.168.1.45",
  "firmware": "2.1.0",
  "uptime_ms": 86400000,
  "seq": 17280,
  "free_heap": 210432,
  "mac": "AA:BB:CC:DD:A1:B2",
  "reset_reason": "Power on",
  "config_mode": false,
  "setup_ap_enabled": false,
  "wifi_mode": "STA",
  "mqtt_connected": true
}
```

| Field | Description |
|-------|-------------|
| `config_mode` | `true` if in setup/fallback mode (AP up because STA failed or unconfigured) |
| `setup_ap_enabled` | `true` whenever the AP interface is currently active (fallback OR always-on) |
| `wifi_mode` | `"STA"` = STA only; `"AP"` = AP only (fallback/setup); `"AP+STA"` = both active |
| `mqtt_connected` | `true` if last MQTT publish cycle succeeded |
