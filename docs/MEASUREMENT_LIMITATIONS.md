# Measurement Limitations

## Current Capability (Firmware v0.4.0)

The firmware measures:

| Quantity | Method | Accuracy |
|----------|--------|----------|
| AC input voltage (Vrms) | ADC RMS of AC-coupled signal | ±3–5% uncalibrated |
| AC output voltage (Vrms) | ADC RMS of AC-coupled signal | ±3–5% uncalibrated |
| Battery DC voltage | ADC average of DC signal | ±2–4% uncalibrated |
| Input current (Arms) | ADC RMS via current transformer | ±5–10% uncalibrated |
| Output current (Arms) | ADC RMS via current transformer | ±5–10% uncalibrated |
| Apparent input power (VA) | Vrms × Arms | Combined V/I error |
| Apparent output power (VA) | Vrms × Arms | Combined V/I error |

## What Is NOT Measured

| Quantity | Field | Reason |
|----------|-------|--------|
| Active (real) power (W) | `p_in_w`, `p_out_w` | Requires time-aligned simultaneous V and I sampling with a true waveform capture, not RMS-only |
| Power factor | `pf_in`, `pf_out` | PF = P/S; without P there is no PF |
| Energy (kWh) | `e_in_kwh`, `e_out_kwh` | Integration of active power over time; blocked by the above |
| Reactive power (VAr) | (none) | Same dependency on waveform |

These fields are stored as `NULL` in the database. They are displayed as "not supported" in the dashboard.

**Do not infer or estimate these values** from apparent power alone. A UPS load with a non-unity PF (e.g. PF=0.7) would produce a 30% overestimate of active power if simply equating S to P.

## Why RMS-Only Is Insufficient for Power Factor

The firmware:
1. Samples at 500 Hz (250 samples per 500 ms window)
2. Computes RMS of voltage and current independently
3. Multiplies Vrms × Irms = S (apparent power in VA)

True active power P = (1/N) × Σ(v[i] × i[i]) requires that v and i samples are **time-aligned**. The ESP32 ADC reads channels sequentially (not simultaneously), introducing a phase offset between the voltage and current readings. This phase error directly corrupts the power factor calculation and makes P unreliable.

## Path to Enabling Active Power and PF

To enable P, PF, and kWh in a future firmware version:

1. **Hardware change**: Add a dedicated power metering IC (e.g. ADE7953, CS5490) that samples V and I in hardware with sub-microsecond synchronization. OR redesign the ADC sampling to use DMA and interleaved channels on a single ADC unit.

2. **Firmware change**: Implement per-sample V×I multiplication and accumulation. Validate against a calibrated power meter.

3. **Validation gate**: Compare P and PF readings against a calibrated reference power analyser (e.g. Fluke 435) across the full load range before publishing P/PF fields.

Until these steps are completed and validated, the firmware must **not** publish `p_in_w`, `p_out_w`, `pf_in`, or `pf_out`, and the dashboard must **not** compute or display these quantities.

## Telemetry Rollup Fields

The `Telemetry1m` table stores 1-minute aggregates of the raw telemetry stream.

| Aggregated field | Type |
|-----------------|------|
| `voltIn`, `voltOut`, `voltDc` | avg / min / max |
| `ctIn`, `ctOut` | avg / max |
| `sInVa`, `sOutVa` (apparent power) | avg / max |
| `rssi` | avg |

**Not in rollup:** `pInW`, `pOutW`, `pfIn`, `pfOut`, `eInKwh`, `eOutKwh`
These are NULL in raw telemetry and are not aggregated.
Do not calculate or infer them from VA fields.

## Calibration

All measurements require calibration coefficients per device:
- `vInScale`, `vInOffset` — input voltage
- `vOutScale`, `vOutOffset` — output voltage  
- `vBattScale`, `vBattOffset` — battery voltage
- `iInScale`, `iInOffset` — input current transformer
- `iOutScale`, `iOutOffset` — output current transformer
- `acZero` — ADC zero crossing offset for AC measurements

Default coefficients (scale=1, offset=0) give raw ADC-derived values with no field calibration. For absolute accuracy, calibrate each device against a reference instrument.

## Current Transformer Note

The output current measurement uses a clamp-type CT (current transformer). CT accuracy depends on:
- Correct number of turns through the CT window (typically 1 conductor pass)
- Proper burden resistor (matched to CT spec)
- CT linearity across the expected current range
- Temperature stability

CT-based measurements are typically ±1–3% accurate when properly calibrated.
