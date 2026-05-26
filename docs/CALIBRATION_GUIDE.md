# Calibration Guide â€” UPS Monitoring System

> **Version:** Guide applies to firmware **v1.0.0** (`firmware/VOLTAGETEST/VOLTAGETEST.ino`).
> Calibration coefficients are now stored in NVS on the device and configured via `http://<device-ip>/` (Calibration section).
> The dashboard admin calibration page (`/admin/calibration`) shows read-only values when embedded broker is disabled.

**Firmware:** v1.0.0
**Applies to:** ESP32 UPS monitoring module and supported external energy analyzer inputs

---

## Overview

The ESP32 module measures AC voltages and currents using the on-chip ADC, which has limited inherent accuracy (Â±3â€“10% uncalibrated). Calibration applies a per-device linear correction:

```
corrected = raw Ã— scale + offset
```

Calibration is stored in ESP32 NVS (`cal` namespace) and survives power cycles and firmware OTA updates. It is **not** cleared by factory reset unless the `cal` namespace is explicitly reset.

---

## âš  Safety Warnings

- **Do not calibrate with live AC mains unless you are qualified.** Mains voltage (230 VAC) is lethal.
- Ensure all connections to the UPS and input wiring are done by a qualified electrician.
- Do not touch exposed mains terminals while the system is energised.
- Use only CAT III or higher rated test instruments for mains measurements.
- Never short voltage divider inputs.
- Battery DC voltages (48â€“54 V) are not lethal at typical impedances but can cause serious burns and arc hazards. Keep metal tools away from battery terminals.
- Calibrate one channel at a time. Confirm each value before proceeding.
- Never set scale to 0. The firmware rejects zero scale values â€” it will not save them.

---

## Required Tools

| Tool | Purpose |
|------|---------|
| Calibrated digital multimeter (DMM), e.g. Fluke 117 or equivalent | Reference voltage and current readings |
| Laptop or phone on the same WiFi network | Access device config portal |
| Dashboard access | Verify live telemetry values |
| Clamp meter with AC/DC capability (optional) | Independent current check |
| Spreadsheet or notepad | Record raw and reference readings |

---

## What Can Be Calibrated

| Parameter | NVS Keys | Config Portal Field | Default |
|-----------|----------|--------------------|---------|
| Input AC voltage scale | `vin_s` | V-In Scale | 1.0 |
| Input AC voltage offset (V) | `vin_o` | V-In Offset | 0.0 |
| Output AC voltage scale | `vout_s` | V-Out Scale | 1.0 |
| Output AC voltage offset (V) | `vout_o` | V-Out Offset | 0.0 |
| Battery DC voltage scale | `vbatt_s` | V-Batt Scale | 1.0 |
| Battery DC voltage offset (V) | `vbatt_o` | V-Batt Offset | 0.0 |
| Input current scale | `iin_s` | I-In Scale | 1.0 |
| Input current offset (A) | `iin_o` | I-In Offset | 0.0 |
| Output current scale | `iout_s` | I-Out Scale | 1.0 |
| Output current offset (A) | `iout_o` | I-Out Offset | 0.0 |
| AC zero ADC reference | `ac_zero` | AC Zero ADC | 1995.0 |

---

## Energy Analyzer Verification

When an external energy analyzer is installed, record its model, CT/PT ratio, Modbus address, communication settings, and register read proof in the field test report. Verify active power, power factor, reactive power, and kWh against the analyzer or a calibrated external meter before release sign-off.

Do not fabricate power or energy values. If a board installation does not include a supported analyzer/source for these fields, leave unavailable fields unset and document the limitation in the field test report.

---

## How the Calibration Formula Works

The firmware computes:

```
corrected_value = raw_adc_value Ã— scale + offset
```

To calibrate a single channel:

1. Read the raw uncalibrated value from the dashboard or `/data` endpoint (with scale=1.0, offset=0.0).
2. Measure the true value with a reference instrument.
3. Calculate:
   ```
   scale  = reference_value / raw_value         (when offset is 0 and raw_value â‰  0)
   offset = reference_value âˆ’ (raw_value Ã— scale)
   ```

For most measurements, a scale-only correction is sufficient. Use offset only if there is a consistent zero-point error (e.g., a CT with a DC bias).

---

## Calibration Procedure

### Step 1 â€” Preparation

1. Connect the ESP32 module to the UPS with normal load connected.
2. Ensure the board is on WiFi and MQTT is publishing (telemetry visible in dashboard).
3. Open the config portal at `http://<device-ip>/config`.
4. Scroll to **Advanced: Calibration** and expand the section.
5. Note all current calibration values before making changes.
6. Open the dashboard UPS detail page in another tab to watch live values.

### Step 2 â€” AC Zero (only if voltages read near 0 when they should not)

The AC zero ADC value (`ac_zero`) is the ADC midpoint for AC-coupled signals. Default is `1995.0`.

- Do **not** change `ac_zero` unless voltage readings show a constant offset at zero load that cannot be corrected by `v_offset`.
- If adjustment is needed, use an oscilloscope to measure the ADC midpoint, not a DMM.
- Safe range: 1800â€“2200. Never set below 100 or above 3900.

### Step 3 â€” Battery DC Voltage Calibration

Battery voltage is the safest to calibrate because it is a DC measurement with no AC zero dependency.

1. Measure the UPS battery voltage with a calibrated DMM (DC volts, across battery terminals or at the sense point).
2. Note the raw value shown in the dashboard `volt_dc` field (with vbatt_s=1.0, vbatt_o=0.0).
3. Calculate: `vbatt_s = DMM_reading / dashboard_reading`
4. Enter the new `V-Batt Scale` in the config portal.
5. Leave `V-Batt Offset` at 0.0 unless there is a confirmed non-zero intercept.
6. Click Save Configuration.
7. Wait 5 seconds, then verify the dashboard `volt_dc` value matches the DMM reading within tolerance.

**Example:**
- DMM reads: 52.4 V
- Dashboard raw: 50.1 V
- New scale: 52.4 / 50.1 = **1.04590**

### Step 4 â€” Input AC Voltage Calibration

1. Measure mains input voltage with a calibrated DMM (AC volts, at the UPS input terminals).
2. Note the raw `volt_in` value from the dashboard (with vin_s=1.0, vin_o=0.0).
3. Calculate: `vin_s = DMM_reading / dashboard_reading`
4. Enter `V-In Scale` in the config portal.
5. Save and verify the dashboard `volt_in` matches the DMM within tolerance.

**Example:**
- DMM reads: 231.2 V
- Dashboard raw: 219.6 V
- New scale: 231.2 / 219.6 = **1.05283**

### Step 5 â€” Output AC Voltage Calibration

Same procedure as Step 4 but at the UPS output terminals.

1. Measure output voltage with DMM (AC volts).
2. Note raw `volt_out` from dashboard.
3. Calculate and set `vout_s`.
4. Verify after save.

### Step 6 â€” Input Current Calibration

Current requires a known load. Apply a steady, measurable AC load at the UPS input.

1. Use a known resistive load (e.g., a 1 kW heater or a set of incandescent bulbs) with a stable current draw.
2. Measure input current with a calibrated clamp meter or inline ammeter.
3. Note raw `ct_in` from dashboard.
4. Calculate: `iin_s = reference_current / dashboard_current`
5. Enter `I-In Scale` in config portal.
6. Verify after save.

**Note:** CT accuracy depends on correct installation (single conductor pass through CT core, correct burden resistor). If readings are grossly wrong at all loads, inspect CT wiring before adjusting scale.

### Step 7 â€” Output Current Calibration

Same procedure as Step 6 but with a known load at the UPS output.

1. Connect a known resistive load to the UPS output.
2. Measure output current with a calibrated clamp meter.
3. Note raw `ct_out` from dashboard.
4. Calculate and set `iout_s`.
5. Verify after save.

---

## Post-Calibration Verification

After all channels are calibrated, verify the following under steady-state conditions:

| Measurement | Target tolerance | Action if outside |
|-------------|-----------------|-------------------|
| `volt_in` vs. DMM | Â±2% | Recalibrate V-In Scale |
| `volt_out` vs. DMM | Â±2% | Recalibrate V-Out Scale |
| `volt_dc` vs. DMM | Â±1% | Recalibrate V-Batt Scale |
| `ct_in` vs. clamp | Â±5% | Recalibrate I-In Scale |
| `ct_out` vs. clamp | Â±5% | Recalibrate I-Out Scale |
| `s_out_va` vs. rated load | Â±10% | Check both V and I accuracy |

**Tolerance rationale:** The ADC and CT hardware limits accuracy to approximately Â±1â€“3% at best. The targets above account for reference instrument uncertainty and real-world wiring variations.

---

## Checking Apparent Power (VA) After Calibration

Apparent power is computed by the firmware as:

```
s_in_va  = volt_in  Ã— ct_in
s_out_va = volt_out Ã— ct_out
```

There is no separate calibration for VA â€” it inherits the accuracy of V and I calibrations. After calibrating voltage and current, verify:

- `s_out_va` matches expected apparent load (e.g., for a 1000 VA load at unity PF, expect 900â€“1100 VA after calibration)
- Load percent shown in dashboard is reasonable

**Do not assume VA = Watts.** For non-resistive loads the actual real power (W) will be lower than the VA reading by a factor equal to the power factor. The firmware does not measure power factor.

---

## Recording Calibration Values

Record calibration per device in the field test report. Minimum fields to record:

```
Device ID:
Date calibrated:
Calibrated by:
Reference instrument (make, model, last cal date):

Calibration coefficients applied:
  vInScale:    _______   vInOffset:    _______
  vOutScale:   _______   vOutOffset:   _______
  vBattScale:  _______   vBattOffset:  _______
  iInScale:    _______   iInOffset:    _______
  iOutScale:   _______   iOutOffset:   _______
  acZero:      _______

Verification readings:
  volt_in  (dashboard / DMM): ______ / ______  Î”: ______%
  volt_out (dashboard / DMM): ______ / ______  Î”: ______%
  volt_dc  (dashboard / DMM): ______ / ______  Î”: ______%
  ct_in    (dashboard / ref): ______ / ______  Î”: ______%
  ct_out   (dashboard / ref): ______ / ______  Î”: ______%

Pass/Fail: _______
Notes: _______
```

Store completed field test reports alongside the inventory record for each UPS in the dashboard.

---

## Resetting Calibration to Factory Defaults

To reset calibration only (without clearing WiFi or MQTT settings):

1. Open config portal at `http://<device-ip>/config`.
2. In the Advanced: Calibration section, set:
   - All Scale fields to `1.000000`
   - All Offset fields to `0.00`
   - AC Zero to `1995.00`
3. Click Save Configuration.

Alternatively, a full factory reset (`/factory-reset`) clears the `cal` NVS namespace along with all other settings.

---

## Limitations Summary

| Limitation | Notes |
|-----------|-------|
| ADC resolution: 12-bit | ~0.024% step size, sufficient for Â±1% voltage accuracy after calibration |
| ADC non-linearity | ESP32 ADC has known non-linearity at the edges of its range; do not operate sensors near ADC rail limits |
| CT phase shift | AC zero-crossing method is not used; VA is Vrms Ã— Irms only |
| No power factor measurement | Hardware limitation â€” requires simultaneous V and I sampling |
| No energy (kWh) measurement | Follows from no active power measurement |
| Temperature drift | Calibration coefficients are temperature-independent; accuracy may degrade significantly at extreme temperatures |
| CT burden resistor mismatch | If CT burden resistor does not match CT spec, current scale will be far from 1.0 |
