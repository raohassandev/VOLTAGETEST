# UMS Operator Guide - v2.1.0

The UPS Management System monitors ESP32 UPS boards running firmware v2.1.0. Boards publish telemetry every 1 second to:

```text
ums/devices/<device_id>/data
```

## Daily Fleet Check

Open the dashboard and review:

| Field | Meaning |
|-------|---------|
| Online | Board has sent telemetry recently |
| Offline | No recent telemetry within the configured threshold |
| Input V / Output V | AC voltage readings |
| Battery V | Calibrated battery bank voltage |
| Load | Output apparent load as percent of configured VA capacity |
| Live Out W | Sum of output W for online devices when available |
| Alarms | Active warning/critical conditions |

## UPS Detail Page

Click a UPS or device to inspect:

- Live voltage, current, VA, load, and battery readings.
- Energy analyzer values: W, PF, Hz, VAR, and kWh.
- Board IP, MAC, firmware, RSSI, and direct links to portal/config/data/OTA.
- Commissioning and physical location fields published by the board.
- Active alarms and alarm history.
- Maintenance notes for assigned inventory UPS records.

`--`, `Not available`, or blank energy values mean the firmware published `null`, the signal was unavailable, or calibration is still required. This is not the same as zero load.

## Measurements

| Field | Unit | Notes |
|-------|------|-------|
| `volt_in` | V | AC input voltage |
| `volt_out` | V | AC output voltage |
| `volt_dc` | V | Battery bank voltage, calibrated in firmware |
| `ct_in` / `ct_out` | A | RMS current |
| `s_in_va` / `s_out_va` | VA | Apparent power |
| `p_in_w` / `p_out_w` | W | Active power; requires calibration |
| `pf_in` / `pf_out` | ratio | Power factor; requires calibration |
| `freq_in` / `freq_out` | Hz | Requires clean waveform crossing |
| `q_in_var` / `q_out_var` | VAR | Unsigned in v2.1.0 |
| `e_in_kwh` / `e_out_kwh` | kWh | Energy counters persisted periodically |

Accuracy depends on reference-meter calibration. See `docs/CALIBRATION_GUIDE.md`.

## Alarms

Use `/alarms` for active and historical alarms.

- Warning: investigate soon.
- Critical: act promptly.
- Offline: board has stopped sending telemetry.

Alarms clear automatically after the measured value returns to normal with debounce and hysteresis.

## Board Configuration

Firmware v2.1.0 does not support remote config push over MQTT. Use the board local web UI:

```text
http://<device-ip>/config
```

If the board is not on WiFi, connect to its setup AP and open:

```text
http://192.168.4.1
```

## OTA Update

Upload the approved v2.1.0 binary through:

```text
http://<device-ip>/update
```

After OTA, verify firmware `2.1.0` in `/api/info`, `/data`, and the dashboard.

## Troubleshooting

### Device Offline

1. Confirm the board has power.
2. Open `http://<device-ip>/data`.
3. Confirm `mqtt_connected` is true.
4. Verify broker host, username, password, and topic `ums/devices/<device_id>/data`.
5. Check dashboard worker logs.

### Readings Look Wrong

1. Check wiring and CT orientation.
2. Compare with a reference meter.
3. Recalibrate through the board local web UI.
4. Confirm battery nominal voltage and UPS capacity in inventory.

### Energy Fields Not Available

1. Confirm firmware is `2.1.0`.
2. Confirm waveform signal quality.
3. Perform reference-meter calibration.
4. Check `docs/FIRMWARE_LIMITATIONS.md` for known limitations.

## Security

- Use non-default MQTT credentials.
- Change setup/OTA passwords after commissioning.
- Do not expose MQTT or dashboard directly to the internet.
- Production dashboard auth must use `UPS_AUTH_PASSWORD_HASH` and a strong `UPS_AUTH_TOKEN`.
