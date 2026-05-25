# Firmware v2.1.0 — Build and Flash Instructions

## Canonical source

```
firmware/VOLTAGETEST/VOLTAGETEST.ino
```

## Pre-built OTA binary

```
release/firmware/v2.1.0/VOLTAGETEST-v2.1.0.merged.bin
```

Use this for OTA update via `http://<device-ip>/update`, or for USB flashing with esptool.

## Build from source (Arduino CLI)

```bash
arduino-cli compile \
  --fqbn esp32:esp32:esp32 \
  firmware/VOLTAGETEST/VOLTAGETEST.ino
```

## Flash via USB (esptool)

```bash
esptool.py --chip esp32 --port /dev/ttyUSB0 \
  write_flash 0x0 release/firmware/v2.1.0/VOLTAGETEST-v2.1.0.merged.bin
```

## Flash via OTA

1. Open `http://<device-ip>/update`
2. Select `release/firmware/v2.1.0/VOLTAGETEST-v2.1.0.merged.bin`
3. Click Update. Device reboots automatically.

## MQTT topic (v2.1.0)

```
ums/devices/<device_id>/data
```

See `docs/FIRMWARE_GUIDE.md` and `docs/MQTT_TOPICS.md` for full reference.

---

> Legacy monitor firmware is archived under `archive/` for development history only. Do not flash it for v2.1.0 deployments.
