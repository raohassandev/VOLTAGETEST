# Firmware

## Location

| Path | Description |
|------|-------------|
| `VOLTAGETEST/VOLTAGETEST.ino` | Energy Analyzer firmware — canonical Arduino sketch (ESP32) |
| `ups_monitor/ups_monitor.ino` | Legacy basic monitor firmware |

## VOLTAGETEST — Energy Analyzer Firmware

Full energy analysis firmware for ESP32-based UPS monitoring nodes.

### Features

- True RMS voltage and current (500 samples/s, 1-second window)
- Real power (W) via instantaneous V×I product integration
- Power factor (P/S, clamped ±1)
- Reactive power Q (VAR, unsigned — √(S²–P²))
- Line frequency via zero-crossing counter (±0.5 Hz accuracy)
- Energy counters (kWh), NVS-persisted every 60 s (survive reboot)
- MQTT publish every 1000 ms to `ums/devices/{device_id}/data`

### Hardware Wiring

| GPIO | ADC Channel | Signal |
|------|-------------|--------|
| GPIO34 | ADC1_CH6 | DC battery voltage (single-ended) |
| GPIO35 | ADC1_CH7 | AC output voltage (transformer-coupled, AC-centered) |
| GPIO32 | ADC1_CH4 | AC input voltage (transformer-coupled, AC-centered) |
| GPIO36 | ADC1_CH0 | AC input CT current (CT + burden resistor, AC-centered) |
| GPIO39 | ADC1_CH3 | AC output CT current (CT + burden resistor, AC-centered) |

### How to Flash (Arduino IDE)

1. Install **Arduino IDE 2.x**
2. Add ESP32 board package: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
3. Install libraries: `PubSubClient`, `ArduinoJson`
4. Open `firmware/VOLTAGETEST/VOLTAGETEST.ino`
5. Select board: **ESP32 Dev Module**
6. Select port, then click **Upload**

### How to Flash (arduino-cli)

```bash
arduino-cli lib install PubSubClient ArduinoJson
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/VOLTAGETEST
arduino-cli upload -p /dev/ttyUSB0 --fqbn esp32:esp32:esp32 firmware/VOLTAGETEST
```

### MQTT Payload

Published to topic `ums/devices/{device_id}/data` every 1000 ms:

```json
{
  "device_id": "ups-node-01",
  "seq": 1234,
  "ip": "192.168.1.100",
  "rssi": -65,
  "volt_in": 230.1,
  "volt_out": 229.8,
  "volt_dc": 13.4,
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
  "firmware": "energy-analyzer-v1.0"
}
```

Fields `freq_in`, `freq_out`, `pf_in`, `pf_out`, `q_in_var`, `q_out_var` are published as `null` when the channel has insufficient signal (no waveform detected).

### Known Limitations

- Phase correction (phaseInDeg / phaseOutDeg) is stored in NVS calibration but **not yet applied** in firmware v1.x — PF accuracy depends on physical sensor alignment
- Frequency accuracy: ±0.5 Hz (zero-crossing count over 1 s window)
- Reactive power Q is unsigned (no sign without phase reference)
- Energy counters: up to 60 s of energy may be lost on unexpected reboot (NVS write interval)
