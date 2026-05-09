# VOLTAGETEST ESP32 + Web Telemetry Project Plan

## Goal

Build a working demo where the ESP32 reads AC voltage, DC voltage, and CT values, publishes telemetry to a public MQTT broker, and a Next.js web app subscribes to the topic to show live telemetry, calibration, thresholds, and alarms.

## Current Firmware State

- ESP32 reads five ADC channels:
  - Input AC voltage
  - Output AC voltage
  - DC voltage
  - Input CT
  - Output CT
- ESP32 connects to WiFi SSID `Rao`.
- ESP32 hosts a local configuration webpage.
- ESP32 can switch between DHCP and static IP.
- ESP32 publishes telemetry to public MQTT broker:
  - Broker: `broker.hivemq.com`
  - Port: `1883`
  - Topic: `hadi/voltagetest/data`
- Serial monitor prints live parameters, WiFi status, IP address, and MQTT target.

## Present Phase: Demo System

### Phase 1: ESP32 Firmware Demo

Status: Mostly complete.

Tasks:

- Keep ESP32 publishing the current raw/derived values.
- Keep WiFi manager webpage on ESP32.
- Keep serial status output for debugging.
- Use current MQTT topic for demo:
  - `hadi/voltagetest/data`

Current payload shape:

```json
{
  "volt_in": 225,
  "volt_out": 224,
  "volt_dc": 543,
  "ct_in": 5,
  "ct_out": 4,
  "ip": "192.168.0.118"
}
```

### Phase 2: Next.js Web Demo

Status: To implement now.

Pages:

- Dashboard
  - Live telemetry cards.
  - MQTT connection status.
  - Last update time.
  - Raw value and calibrated value.
  - Normal, low alarm, and high alarm visual state.

- Module Configuration
  - Configure module name and MQTT topic.
  - Configure calibration per parameter:
    - Display name
    - Unit
    - Scale
    - Offset
    - Low limit
    - High limit
    - Alarm enabled
  - Save settings in browser `localStorage` for demo.

- Alarms
  - Show active alarms.
  - Show alarm type, parameter, current value, configured limit, and time.

- Thresholds & Values
  - Table of all parameters.
  - Raw value, calibrated value, low limit, high limit, and current status.

### Phase 3: Demo Calibration

For the current known test setup:

- Input AC: actual around `220 VAC`, reading around `225`
- Output AC: actual around `220 VAC`, reading around `224`
- DC: actual `24 VDC`, reading around `543`
- CT values need calibration using known load current.

Initial demo calibration recommendation:

```text
Volt_In scale  = 1.0
Volt_Out scale = 1.0
Volt_DC scale  = 0.0442
CT_In scale    = 1.0 until known load test
CT_Out scale   = 1.0 until known load test
```

Formula:

```text
calibrated_value = raw_value * scale + offset
```

## Future Phase: Production System

### Phase 4: Improved MQTT Topic Structure

Use unique module topics:

```text
hadi/voltagetest/VOLTAGETEST-01/data
hadi/voltagetest/VOLTAGETEST-02/data
```

Recommended production payload:

```json
{
  "module_id": "VOLTAGETEST-01",
  "raw": {
    "volt_in": 225,
    "volt_out": 224,
    "volt_dc": 543,
    "ct_in": 5,
    "ct_out": 4
  },
  "values": {
    "volt_in": 225.0,
    "volt_out": 224.0,
    "volt_dc": 24.0,
    "ct_in": 4.5,
    "ct_out": 4.3
  },
  "network": {
    "ip": "192.168.0.118",
    "rssi": -55
  },
  "ts": 1788800000
}
```

### Phase 5: VPS Deployment

Recommended VPS stack:

- Next.js app
- Private Mosquitto MQTT broker
- PostgreSQL or SQLite database
- Nginx reverse proxy
- PM2 or systemd service
- TLS certificate using Let's Encrypt

Production MQTT should use:

- Private broker address
- Username/password
- TLS where possible
- Per-module credentials if required

### Phase 6: Database Persistence

Store:

- Modules
- Calibration settings
- Threshold settings
- Telemetry history
- Active alarms
- Alarm history
- User accounts

### Phase 7: Reporting and Operations

Add:

- Historical charts
- Alarm acknowledgment
- Alarm notifications by email/SMS/WhatsApp
- Export CSV/PDF
- Device online/offline monitoring
- Last-seen status
- Role-based access

## Demo Acceptance Criteria

The demo is considered complete when:

- ESP32 publishes telemetry to MQTT.
- Web app receives telemetry live.
- Dashboard updates without page refresh.
- Calibration can be changed from the web app.
- Thresholds can be changed from the web app.
- Alarms appear when calibrated values cross limits.
- Settings persist after browser refresh.
- App can be run locally and later deployed to VPS.
