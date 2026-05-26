# Firmware Limitations - UPS Monitoring System

**Firmware version:** v1.0.0
**Canonical source:** `firmware/VOLTAGETEST/VOLTAGETEST.ino`
**Last updated:** 2026-05-25

## Config Push

Remote config push over MQTT is not supported in firmware v1.0.0.

- Firmware does not subscribe to `ums/devices/{deviceId}/config`.
- In external-broker/Docker mode, `/api/devices/{deviceId}/config` returns HTTP 501.
- Calibration, WiFi, MQTT, and identity changes must be made through the board local web UI at `http://<device-ip>/config`.

## Command Subscription

Remote command topics are not supported in firmware v1.0.0.

- Firmware does not subscribe to `ums/devices/{deviceId}/command`.
- Remote reset, relay control, and mode-change commands must remain disabled until firmware support is added.

## Energy Analyzer Accuracy

Firmware v1.0.0 implements real power, power factor, reactive power, frequency, and kWh fields:

- `p_in_w`, `p_out_w`
- `pf_in`, `pf_out`
- `q_in_var`, `q_out_var`
- `freq_in`, `freq_out`
- `e_in_kwh`, `e_out_kwh`

These fields are not guaranteed accurate until the voltage and current channels are calibrated with reference instruments. If waveform quality is insufficient or calibration is not complete, the firmware may publish `null`.

Current measurement limitations:

- Phase correction values are stored in NVS but not yet applied to active/reactive power calculations.
- Reactive power sign is unsigned because phase direction is not yet certified.
- ESP32 ADC timing and sensor phase shift affect PF and W accuracy.
- Frequency depends on stable zero-crossing detection.

## Energy Counter Persistence

Energy counters are stored in NVS periodically.

- A sudden power loss can lose up to 60 seconds of accumulated energy.
- Counters survive normal reboot and OTA.
- Use `/resetenergy` only during commissioning or after an approved maintenance reset.

## OTA Rollback

The ESP32 Arduino OTA partition scheme may roll back if a new image fails early boot.

- Verify the `firmware` field in `/api/info`, `/data`, and dashboard telemetry after OTA.
- If rollback is detected, reflash via USB or upload the correct v1.0.0 binary again.

## Calibration Persistence

Calibration coefficients are stored in NVS.

- NVS survives OTA and power cycles.
- Recalibrate when the board, sensors, CTs, transformer, divider, UPS, or battery bank changes.

## Web UI Responsiveness

The sampler and web server share the Arduino loop.

- During sampling/publish windows, board web pages may respond slowly.
- Use local web UI changes during commissioning windows, not during critical monitoring events.

## Summary

| Feature | Status | Notes |
|---------|--------|-------|
| MQTT telemetry | Supported | Publishes to `ums/devices/{device_id}/data` every 1 second |
| MQTT auth | Supported | Username/password from board config |
| `/api/info` | Supported | Used by LAN scanner |
| OTA update | Supported | Verify firmware after upload |
| W/PF/kWh/Q/Hz | Implemented | Requires reference-meter calibration |
| Config push via MQTT | Not supported | Use board local web UI |
| Remote commands | Not supported | Firmware subscription needed |
