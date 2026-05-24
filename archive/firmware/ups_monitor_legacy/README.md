# ESP32 UPS Monitor Firmware

This folder contains the ESP32 firmware for the UPS monitoring module.

## Current Sketch

- `ups_monitor.ino`

Current firmware behavior:

- Reads input AC voltage, output AC voltage, battery DC voltage, input CT, and output CT ADC channels.
- Hosts a local WiFi configuration page.
- Publishes telemetry over MQTT.
- Supports local web OTA.
- Stores device identity, MQTT settings, WiFi settings, OTA password, and calibration in ESP32 Preferences.

## Production Direction

Next firmware work should focus on:

- Device identity: `device_id`, `site_id`, `ups_id`.
- Private MQTT broker and per-device credentials.
- Phase-correct active/reactive power calculation.
- Health/status telemetry.

## Provisioning

The sketch no longer contains production WiFi or MQTT credentials.

On first boot:

1. Connect to the setup access point shown by the module.
2. Open the module web page.
3. Configure device identity:
   - `device_id`
   - `site_id`
   - `ups_id`
   - setup AP password
   - OTA password
4. Configure WiFi.
5. Configure MQTT broker host, port, username, password, and telemetry topic.

Stored settings are saved in ESP32 Preferences namespaces:

- `device`
- `wifi`
- `mqtt`
- `cal`

## Current Telemetry Payload

The firmware still publishes the original demo measurement fields, with production identity and health metadata added:

```json
{
  "volt_in": 230.0,
  "volt_out": 229.0,
  "volt_dc": 540.0,
  "ct_in": 4.1,
  "ct_out": 3.8,
  "s_in_va": 943.0,
  "s_out_va": 870.2,
  "ip": "192.168.1.90",
  "device_id": "UPSMON-001",
  "site_id": "SITE-01",
  "ups_id": "UPS-01",
  "firmware": "0.3.0",
  "rssi": -55,
  "uptime_ms": 123456
}
```

## Next Firmware Step

Confirm OTA and calibrated RMS readings on hardware, then add phase-correct real power, reactive power, power factor, and energy counters.

## Measurement Notes

Firmware `0.3.0` uses:

- DC average for battery voltage.
- RMS-style accumulation around configurable `AC Zero ADC` for AC voltage and CT channels.
- Per-channel scale and offset calibration.
- Apparent power estimates:
  - `s_in_va = volt_in * ct_in`
  - `s_out_va = volt_out * ct_out`

This is not yet active power or reactive power. Watts, VAR, PF, kWh, and kVARh require synchronized voltage/current phase processing and field validation.

## Local Compile

Verified compile command:

```powershell
& 'C:\Program Files\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe' compile --fqbn esp32:esp32:esp32 firmware\ups_monitor
```

Last verified board target:

- `esp32:esp32:esp32` - ESP32 Dev Module

## OTA

Local web OTA is available at:

```text
http://<device-ip>/update
```

The update page requires the configured OTA password. Upload the compiled firmware `.bin` produced by Arduino CLI or Arduino IDE.
