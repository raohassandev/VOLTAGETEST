/**
 * Canonical display labels for all telemetry metrics.
 *
 * Single source of truth — import METRIC_LABEL wherever a human-readable
 * name is needed. Field names (volt_in, ct_out, …) are unchanged in the
 * DB, MQTT payloads, and API responses.
 *
 * Convention: Input = mains side (before UPS), Output = load side (after UPS)
 */

export const METRIC_LABEL: Record<string, string> = {
  // ── Voltage ──────────────────────────────────────────────────────────────
  volt_in:   "Input Voltage",
  volt_out:  "Output Voltage",
  volt_dc:   "Battery Voltage",

  // ── Current ──────────────────────────────────────────────────────────────
  ct_in:     "Input Current",
  ct_out:    "Output Current",

  // ── Apparent power ────────────────────────────────────────────────────────
  s_in_va:   "Input Apparent Power",
  s_out_va:  "Output Apparent Power",

  // ── Real power ────────────────────────────────────────────────────────────
  p_in_w:    "Input Active Power",
  p_out_w:   "Output Active Power",

  // ── Power factor ──────────────────────────────────────────────────────────
  pf_in:     "Input Power Factor",
  pf_out:    "Output Power Factor",

  // ── Reactive power ────────────────────────────────────────────────────────
  q_in_var:  "Input Reactive Power",
  q_out_var: "Output Reactive Power",

  // ── Energy ────────────────────────────────────────────────────────────────
  e_in_kwh:  "Input Energy",
  e_out_kwh: "Output Energy",

  // ── Frequency ─────────────────────────────────────────────────────────────
  freq_in:   "Input Frequency",
  freq_out:  "Output Frequency",

  // ── Other ─────────────────────────────────────────────────────────────────
  rssi:      "Signal Strength",
  offline:   "Device Offline",
};

/** Short labels for cards/charts where space is limited */
export const METRIC_LABEL_SHORT: Record<string, string> = {
  volt_in:   "In Voltage",
  volt_out:  "Out Voltage",
  volt_dc:   "Battery V",
  ct_in:     "In Current",
  ct_out:    "Out Current",
  s_in_va:   "In VA",
  s_out_va:  "Out VA",
  p_in_w:    "In Power",
  p_out_w:   "Out Power",
  pf_in:     "In PF",
  pf_out:    "Out PF",
  q_in_var:  "In VAR",
  q_out_var: "Out VAR",
  e_in_kwh:  "In Energy",
  e_out_kwh: "Out Energy",
  freq_in:   "In Freq",
  freq_out:  "Out Freq",
  rssi:      "RSSI",
  offline:   "Offline",
};

/** Unit for each metric */
export const METRIC_UNIT: Record<string, string> = {
  volt_in:   "V",
  volt_out:  "V",
  volt_dc:   "V",
  ct_in:     "A",
  ct_out:    "A",
  s_in_va:   "VA",
  s_out_va:  "VA",
  p_in_w:    "W",
  p_out_w:   "W",
  pf_in:     "",
  pf_out:    "",
  q_in_var:  "VAR",
  q_out_var: "VAR",
  e_in_kwh:  "kWh",
  e_out_kwh: "kWh",
  freq_in:   "Hz",
  freq_out:  "Hz",
  rssi:      "dBm",
};

/** Helper — returns full label, falls back to the key itself */
export function metricLabel(key: string, short = false): string {
  return (short ? METRIC_LABEL_SHORT[key] : METRIC_LABEL[key]) ?? key;
}
