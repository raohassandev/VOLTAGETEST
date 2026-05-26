# Measurement Limitations

## Current Capability (Firmware v1.0.0)

The firmware measures:

| Quantity | Method | Accuracy |
|----------|--------|----------|
| AC input voltage (Vrms) | ADC RMS of AC-coupled signal | Â±3â€“5% uncalibrated |
| AC output voltage (Vrms) | ADC RMS of AC-coupled signal | Â±3â€“5% uncalibrated |
| Battery DC voltage | ADC average of DC signal | Â±2â€“4% uncalibrated |
| Input current (Arms) | ADC RMS via current transformer | Â±5â€“10% uncalibrated |
| Output current (Arms) | ADC RMS via current transformer | Â±5â€“10% uncalibrated |
| Apparent input power (VA) | Vrms Ã— Arms | Combined V/I error |
| Apparent output power (VA) | Vrms Ã— Arms | Combined V/I error |

## Energy Analyzer Fields (v1.0.0)

Firmware v1.0.0 includes energy-analyzer code and publishes the following fields:

| Quantity | Field | Status |
|----------|-------|--------|
| Active input power (W) | `p_in_w` | Published; accuracy requires reference-meter calibration |
| Active output power (W) | `p_out_w` | Published; accuracy requires reference-meter calibration |
| Power factor (input) | `pf_in` | Published; accuracy requires reference-meter calibration |
| Power factor (output) | `pf_out` | Published; accuracy requires reference-meter calibration |
| Reactive power (VAR) | `q_in_var`, `q_out_var` | Published; accuracy requires reference-meter calibration |
| Energy (kWh) | `e_in_kwh`, `e_out_kwh` | Published; NVS-persisted; accuracy requires reference-meter calibration |
| Frequency | `freq_in`, `freq_out` | Published; accuracy depends on zero-crossing detection quality |

**If a value is not valid or not yet calibrated, the firmware publishes `null`.** The UI shows `â€”` (Not available) for null fields.

### Calibration requirement

Code supports the field. **Production accuracy requires reference-meter calibration** (e.g. Fluke 435 or equivalent power analyser) across the full load range. Without calibration:

- `p_in_w`, `p_out_w`, `pf_in`, `pf_out`, `q_in_var`, `q_out_var`, `e_in_kwh`, `e_out_kwh` may be unreliable.
- The sequential ADC sampling approach (channels read one at a time) introduces a phase offset between V and I. This is a known limitation. See *Path to Improving PF Accuracy* below.

**Do not infer or estimate these values** from apparent power alone. A UPS load with a non-unity PF (e.g. PF=0.7) would produce a 30% overestimate of active power if simply equating S to P.

## Why RMS-Only Is Insufficient for Power Factor

The firmware:
1. Samples at 500 Hz (250 samples per 500 ms window)
2. Computes RMS of voltage and current independently
3. Multiplies Vrms Ã— Irms = S (apparent power in VA)

True active power P = (1/N) Ã— Î£(v[i] Ã— i[i]) requires that v and i samples are **time-aligned**. The ESP32 ADC reads channels sequentially (not simultaneously), introducing a phase offset between the voltage and current readings. This phase error directly corrupts the power factor calculation and makes P unreliable.

## Path to Improving PF Accuracy

The current sequential ADC approach has a phase limitation. To improve P, PF accuracy:

1. **Hardware change**: Add a dedicated power metering IC (e.g. ADE7953, CS5490) that samples V and I in hardware with sub-microsecond synchronization. OR redesign the ADC sampling to use DMA and interleaved channels on a single ADC unit.

2. **Firmware change**: Implement per-sample VÃ—I multiplication and accumulation. Validate against a calibrated power meter.

3. **Validation gate**: Compare P and PF readings against a calibrated reference power analyser (e.g. Fluke 435) across the full load range before publishing P/PF fields.

Until these steps are completed and validated, treat `p_in_w`, `p_out_w`, `pf_in`, and `pf_out` as indicative only. The firmware publishes them as `null` when not calibrated. The dashboard displays `â€”` for null values.

## Telemetry Rollup Fields

The `Telemetry1m` table stores 1-minute aggregates of the raw telemetry stream.

| Aggregated field | Type |
|-----------------|------|
| `voltIn`, `voltOut`, `voltDc` | avg / min / max |
| `ctIn`, `ctOut` | avg / max |
| `sInVa`, `sOutVa` (apparent power) | avg / max |
| `rssi` | avg |

**Also in rollup (nullable â€” NULL when firmware does not publish):**
`freqInAvg`, `freqOutAvg`, `pInWAvg/Max`, `pOutWAvg/Max`, `pfInAvg`, `pfOutAvg`, `qInVarAvg`, `qOutVarAvg`, `eInKwhLast`, `eOutKwhLast`

These aggregate to NULL when the firmware returns null values (current default).
Do not calculate or infer them from VA fields.

## Calibration

All measurements require calibration coefficients per device:
- `vInScale`, `vInOffset` â€” input voltage
- `vOutScale`, `vOutOffset` â€” output voltage
- `vBattScale`, `vBattOffset` â€” battery voltage
- `iInScale`, `iInOffset` â€” input current transformer
- `iOutScale`, `iOutOffset` â€” output current transformer
- `acZero` â€” ADC zero crossing offset for AC measurements

Default coefficients (scale=1, offset=0) give raw ADC-derived values with no field calibration. For absolute accuracy, calibrate each device against a reference instrument.

## Current Transformer Note

The output current measurement uses a clamp-type CT (current transformer). CT accuracy depends on:
- Correct number of turns through the CT window (typically 1 conductor pass)
- Proper burden resistor (matched to CT spec)
- CT linearity across the expected current range
- Temperature stability

CT-based measurements are typically Â±1â€“3% accurate when properly calibrated.
