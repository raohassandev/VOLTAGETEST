# Commissioning Guide — UPS Monitoring System

This guide covers setting up a new ESP32 monitoring module for a UPS unit and registering it in the dashboard.

---

## Step 1 — Flash the Firmware

1. Open `firmware/ups_monitor/ups_monitor.ino` in Arduino IDE.
2. Install board support: `esp32 by Espressif Systems` via Boards Manager.
3. Select board: **ESP32 Dev Module** (or your specific variant).
4. Upload settings: 921600 baud, default partition scheme.
5. Flash and verify via Serial Monitor at 921600 baud.

Default publish interval is **5000 ms** (5 seconds). This is appropriate for production.

---

## Step 2 — Initial Device Setup

After flashing, the ESP32 creates an Access Point:
- **SSID:** `UPSMON-Setup-<MAC>` (or the configured Device ID)
- **Password:** `ChangeMe123` (default — change immediately)

Connect to the AP and open `http://192.168.4.1` in a browser.

### 2a. Device Identity

Set unique identifiers that match your site plan:

| Field | Example | Notes |
|-------|---------|-------|
| Device ID | `UPSMON-B1-01` | Unique per ESP32 module |
| Site ID | `SITE-HQ` | Matches your site naming |
| UPS ID | `UPS-B1-F2-01` | Unique per UPS unit |
| AP Password | (strong password) | Min 8 chars |
| OTA Password | (strong password) | Min 8 chars |

Click **Save Device**.

### 2b. MQTT Settings

| Field | Value |
|-------|-------|
| Broker Host | IP or hostname of your MQTT broker |
| Port | 1883 (or 8883 for TLS) |
| Username | `dashboard` (or per-device credential) |
| Password | Your MQTT password |
| Topic | `building/site-01/ups/UPSMON-B1-01/telemetry` |

> **Topic convention:** `building/<site-id>/ups/<device-id>/telemetry`
> The dashboard subscribes to `building/+/ups/+/telemetry` by default.

Click **Save MQTT**.

### 2c. WiFi Settings

Enter your building WiFi credentials and click **Save and Reconnect**.

Verify the device connects: the Live Data panel should show voltage readings.

### 2d. Calibration (if required)

Default calibration coefficients (scale=1, offset=0) are suitable for initial deployment.
Adjust only after measured values are compared to a calibrated reference instrument.

---

## Step 3 — Register in Dashboard

1. Log in to the dashboard at `http://<server>:3000`.
2. Navigate to **Inventory** (`/admin/inventory`).
3. Click **Add UPS** and fill in:
   - **UPS ID:** Must match the `ups_id` you set on the device (e.g., `UPS-B1-F2-01`)
   - **Device ID:** Must match the `device_id` set on the device (e.g., `UPSMON-B1-01`)
   - **Serial:** UPS manufacturer serial number
   - **Floor / Location:** Physical location in the building
   - **Capacity VA:** UPS rated capacity (e.g., `3000`)
   - **Battery nominal V:** Battery bank voltage (e.g., `48` for 48V battery)
4. Click **Save UPS**.

> The `Device ID` and `UPS ID` values link the physical module to the inventory record.
> The alarm engine uses `batteryNominalV` to compute battery thresholds.

---

## Step 4 — Verify Telemetry

After a few seconds, the device should appear in the dashboard fleet table with live values.

Check:
- Input voltage is ~230 VAC (or your local mains nominal)
- Output voltage matches (UPS in bypass or online mode)
- Battery voltage matches the charger output (typically 48–54 V for a 48V bank)
- Load % is reasonable (not 0% or >100%)
- RSSI is above –75 dBm

---

## Step 5 — Default Alarm Thresholds

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

## Step 6 — Repeating for 50 Devices

Repeat Steps 1–5 for each UPS module.

Naming convention recommendation:
- Device ID: `UPSMON-<floor>-<sequence>` e.g. `UPSMON-B1-01`
- UPS ID: `UPS-<floor>-<room>-<sequence>` e.g. `UPS-B1-IT01`
- Topic: `building/<site-id>/ups/<device-id>/telemetry`

All devices sharing a site should use the same MQTT broker and the same site-id prefix.

---

## OTA Firmware Update

1. Navigate to `http://<device-ip>/update` (use AP IP `192.168.4.1` if on same network).
2. Enter OTA password.
3. Select the `.bin` firmware file.
4. Click Upload — device will restart automatically.

Verify the new firmware version appears in the dashboard device info.
