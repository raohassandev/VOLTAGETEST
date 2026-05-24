# Firmware Limitations — UPS Monitoring System

**Firmware version:** v2.1.0  
**Hardware:** ESP32 (bare-metal Arduino, single core task model)  
**Last updated:** 2026-05-24

---

## 1. Config Push (MQTT) — Not Supported

The dashboard has a *Push Config* feature that publishes calibration settings over MQTT to the device.

**Current status:** Disabled in Docker/production mode.

- The firmware does **not** subscribe to `ums/devices/{deviceId}/config`
- Config changes must be made via the device's local web UI at `http://<device-ip>/`
- The `/api/devices/{deviceId}/config` API returns **HTTP 501** when `ENABLE_EMBEDDED_BROKER=false`

**To enable in a future version:**
1. Add `mqttClient.subscribe("ums/devices/" + deviceId + "/config")` in firmware
2. Parse incoming JSON config payload and write to NVS
3. Publish ACK to `ums/devices/{deviceId}/config/ack`
4. Set `ENABLE_EMBEDDED_BROKER=false` and implement the external MQTT publish path in the route

---

## 2. Command Subscription — Not Supported

The device **does not** subscribe to the command topic `ums/devices/{deviceId}/command`.

- The Boards page shows a **"Commands disabled"** badge next to each device
- Remote reset, relay control, and mode-change commands are not functional
- Firmware must subscribe to the command topic and implement handlers before this is enabled

---

## 3. Active Power, Power Factor, Energy (kWh) — Not Available

Fields `p_in_w`, `p_out_w`, `pf_in`, `pf_out`, `e_in_kwh`, `e_out_kwh` are always **null**.

Root cause: The ESP32 ADC reads voltage and current channels **sequentially**, not simultaneously.
True active power (P = Σ v[i]×i[i] / N) requires time-aligned samples — the sequential ADC
introduces a phase offset that corrupts the calculation.

These fields are stored as `NULL` in the database and shown as *"Not available — firmware calibration required"* in the UPS detail page.

See `docs/MEASUREMENT_LIMITATIONS.md` for the full technical explanation and the path to enabling these fields.

---

## 4. Frequency Measurement — Depends on Zero-Crossing Signal Quality

Fields `freq_in` and `freq_out` are derived from zero-crossing detection on the AC waveform.

- Correct readings require a valid AC-coupled signal reaching the ADC mid-scale
- If the ADC signal never crosses the detection threshold (e.g. offset miscalibrated), the firmware returns `null`
- **Fix:** Use the calibration page to adjust `vInOffset` / `vOutOffset` until the waveform crosses zero

---

## 5. OTA Rollback

The ESP32 uses the Arduino framework dual-partition OTA scheme.

- If new firmware crashes on first boot, the bootloader automatically rolls back to the previous partition
- A crash on boot results in the old firmware running silently — the dashboard will show the old firmware version in `/api/info`
- To detect rollback: compare `firmware` field in MQTT payload against expected version
- **Recovery:** Re-flash via USB with `arduino-cli` targeting the correct COM port

---

## 6. MQTT Reconnect Behavior

The firmware connects once per `publishMqttData()` call, publishes one message, and disconnects.

- There is no persistent MQTT connection between publish intervals
- A new TCP connection + MQTT CONNECT is opened every publish cycle (default 10 s)
- QoS 1 PUBACK is awaited but on timeout (1000 ms) the firmware continues silently
- **Impact:** Very brief network outages between publish cycles are invisible; only sustained outages show as offline in the dashboard

---

## 7. NVS Calibration Persistence

Calibration coefficients are stored in NVS under the `cal` namespace.

- NVS survives OTA firmware updates and power cycles
- NVS is **not** cleared by factory reset unless the `cal` partition is explicitly erased
- If a device is redeployed to a different hardware installation, old calibration values may carry over — always re-calibrate when hardware is changed

---

## 8. Single Sampler Task — Blocking Delays

The ADC sampler runs in `loop()` using `delay()` between samples.

- During sampling (`sampleAndPublish()`), the web server is not responsive
- Long publish windows (default 10 s) may cause the browser-based config page to time out
- **Mitigation:** Reduce `REPORTING_INTERVAL_MS` in config or split sampling into a FreeRTOS task

---

## Summary Table

| Feature | Status | Notes |
|---------|--------|-------|
| Config push via MQTT | ❌ Not supported | Use local web UI |
| Remote commands | ❌ Not supported | Firmware must subscribe to command topic |
| Active power (W) | ❌ Not available | Requires simultaneous V+I sampling |
| Power factor | ❌ Not available | Requires active power |
| Energy (kWh) | ❌ Not available | Requires active power integration |
| Frequency measurement | ⚠️ Conditional | Requires correct AC offset calibration |
| OTA update | ✅ Supported | HTTP multipart or raw binary; rollback on crash |
| Calibration via NVS | ✅ Supported | Persists across OTA and power cycles |
| MQTT authentication | ✅ Supported | Username + password from NVS (firmware v2.1.0+) |
| /api/info endpoint | ✅ Supported | Returns device metadata for LAN scanner |
