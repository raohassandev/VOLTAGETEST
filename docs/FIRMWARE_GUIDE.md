# Firmware Guide — VOLTAGETEST v2.1.0

## Canonical file

```
firmware/VOLTAGETEST/VOLTAGETEST.ino
```

Do not flash any other `.ino` file. Archived legacy monitor sketches must not be used for v2.1.0 deployments.

---

## Prerequisites

- Arduino IDE 2.x or Arduino CLI
- Board support: `esp32 by Espressif Systems` ≥ 3.x (via Boards Manager)
- Board target: **ESP32 Dev Module**
- Upload baud: **921600**

---

## Compile (Arduino CLI)

```bash
arduino-cli compile \
  --fqbn esp32:esp32:esp32 \
  firmware/VOLTAGETEST/VOLTAGETEST.ino
```

Pre-compiled binary: `release/firmware/v2.1.0/VOLTAGETEST-v2.1.0.merged.bin`

---

## Flash via Serial

```bash
arduino-cli upload \
  --fqbn esp32:esp32:esp32 \
  --port /dev/ttyUSB0 \
  firmware/VOLTAGETEST/VOLTAGETEST.ino
```

Or use **esptool** with the merged binary:

```bash
esptool.py --chip esp32 --port /dev/ttyUSB0 \
  write_flash 0x0 release/firmware/v2.1.0/VOLTAGETEST-v2.1.0.merged.bin
```

---

## Flash via OTA (after first flash)

1. Open `http://<device-ip>/update` in a browser.
2. Select `release/firmware/v2.1.0/VOLTAGETEST-v2.1.0.merged.bin`.
3. Click **Update**. Device reboots automatically.

---

## First-Boot Configuration

On first boot the board starts a WiFi AP:

- **SSID:** `UMS-SETUP-<last4MAC>`
- **Password:** `UMSSetup2026`
- **Portal IP:** `http://192.168.4.1`

Configure via the web portal:

| Field | Description |
|-------|-------------|
| Device ID | Unique ID, e.g. `UMS-3076F5A5AD54` (auto-derived from MAC if blank) |
| WiFi SSID / Password | Site WiFi credentials |
| MQTT Host | IP or hostname of broker, e.g. `192.168.0.104` |
| MQTT Port | Default `1883` |
| MQTT Username | Must match `device_id` |
| MQTT Password | Set in Mosquitto `passwords` file |

---

## `/api/info` Endpoint

```
GET http://<device-ip>/api/info
```

Response:

```json
{
  "device_id": "UMS-3076F5A5AD54",
  "firmware": "2.1.0",
  "mac": "30:76:F5:A5:AD:54",
  "ip": "192.168.0.100",
  "mqtt_host": "192.168.0.104",
  "mqtt_port": 1883,
  "mqtt_topic": "ums/devices/UMS-3076F5A5AD54/data",
  "mqtt_auth": true
}
```

---

## `/data` Endpoint

```
GET http://<device-ip>/data
```

Returns the same fields as the MQTT payload. Fields are `null` when not available (see `docs/MEASUREMENT_LIMITATIONS.md`).

---

## Version History

| Version | Notes |
|---------|-------|
| v2.1.0 | MQTT auth (NVS), `/api/info`, energy-analyzer fields, TCP flush fix, `FIRMWARE_VERSION` constant |
| v0.5.x | Old topic scheme (`building/.../telemetry`) — archived |
