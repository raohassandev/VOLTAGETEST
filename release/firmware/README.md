# Firmware v0.5.2 — Build and Flash Instructions

The firmware binary is not committed to the repository. Build it from source using Arduino CLI.

---

## Pre-built binary location (from last verified build)

If you cloned this repository after the last successful compile, a pre-built binary is available at:

```
firmware/ups_monitor/build/esp32.esp32.esp32/ups_monitor.ino.bin
```

This is the OTA-uploadable binary (single merged app partition).

For USB flashing using `esptool.py`, use the full merged binary:

```
firmware/ups_monitor/build/esp32.esp32.esp32/ups_monitor.ino.merged.bin
```

---

## Build from source

### Requirements

- Arduino CLI 0.35 or later
- ESP32 board package: `esp32 by Espressif Systems` v3.x

### Install board package (first time only)

```bash
arduino-cli core update-index
arduino-cli core install esp32:esp32
```

### Compile

From the repository root:

```bash
arduino-cli compile \
  --fqbn esp32:esp32:esp32 \
  --warnings default \
  --export-binaries \
  firmware/ups_monitor
```

On Windows (PowerShell):

```powershell
arduino-cli compile `
  --fqbn esp32:esp32:esp32 `
  --warnings default `
  --export-binaries `
  firmware/ups_monitor
```

Output will be in `firmware/ups_monitor/build/esp32.esp32.esp32/`.

### Flash via USB

```bash
arduino-cli upload -p <COM_PORT> --fqbn esp32:esp32:esp32 firmware/ups_monitor
```

Replace `<COM_PORT>` with your port, e.g. `COM11` on Windows or `/dev/ttyUSB0` on Linux.

### Flash via OTA

1. Navigate to `http://<device-ip>/update`
2. Enter OTA password
3. Upload `ups_monitor.ino.bin`
4. Device reboots automatically

---

## Verified build environment

- Arduino CLI: 0.35.3
- ESP32 board package: 3.2.0
- Target FQBN: `esp32:esp32:esp32`
- Firmware version constant: `0.5.2` (see `ups_monitor.ino`, `FIRMWARE_VERSION`)
- Compile warnings: default (no errors)
- Binary size at last compile: ~1.1 MB (within 4 MB flash partition)
