# Firmware

## Location

| Path | Description |
|------|-------------|
| `VOLTAGETEST/VOLTAGETEST.ino` | Canonical ESP32 energy analyzer firmware for UMS v1.0.0 |
| `../archive/firmware/legacy-monitor/` | Archived legacy monitor notes; do not flash for v1.0.0 deployments |

## VOLTAGETEST v1.0.0

Full energy analysis firmware for ESP32-based UPS monitoring nodes.

### Features

- True RMS voltage and current using a 1-second sampling window.
- Real power in watts via instantaneous voltage-current product integration.
- Power factor, unsigned reactive power, frequency, and kWh counters.
- Energy counters are persisted to NVS every 60 seconds.
- MQTT publish every 1 second to `ums/devices/{device_id}/data`.
- `/api/info`, `/data`, `/calib`, `/resetenergy`, and `/update` HTTP endpoints.

### Hardware Wiring

| GPIO | ADC Channel | Signal |
|------|-------------|--------|
| GPIO34 | ADC1_CH6 | DC battery voltage |
| GPIO35 | ADC1_CH7 | AC output voltage |
| GPIO32 | ADC1_CH4 | AC input voltage |
| GPIO36 | ADC1_CH0 | AC input CT current |
| GPIO39 | ADC1_CH3 | AC output CT current |

### Flash With Arduino CLI

```bash
arduino-cli lib install PubSubClient ArduinoJson
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/VOLTAGETEST
arduino-cli upload -p /dev/ttyUSB0 --fqbn esp32:esp32:esp32 firmware/VOLTAGETEST
```

The official OTA binary is:

```text
release/firmware/v1.0.0/VOLTAGETEST-v1.0.0.merged.bin
```

### MQTT Payload

Published to `ums/devices/{device_id}/data` every 1 second:

```json
{
  "device_id": "UMS-3076F5A5AD54",
  "seq": 1234,
  "ip": "192.168.1.100",
  "rssi": -65,
  "volt_in": 230.1,
  "volt_out": 229.8,
  "volt_dc": 53.1,
  "ct_in": 2.31,
  "ct_out": 1.85,
  "s_in_va": 531.5,
  "s_out_va": 424.9,
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
  "firmware": "1.0.0"
}
```

Energy analyzer fields publish `null` when a waveform is unavailable, the channel has insufficient signal, or calibration is incomplete.

### Known Limitations

- Phase correction is stored in NVS but not yet applied in v1.0.0.
- Reactive power sign is unsigned.
- Frequency depends on clean zero-crossing detection.
- Up to 60 seconds of kWh accumulation can be lost on unexpected power loss before the next NVS save.
- Accuracy requires calibration against reference instruments.
