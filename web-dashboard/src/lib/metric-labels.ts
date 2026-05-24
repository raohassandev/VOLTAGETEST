/**
 * Canonical display labels for all telemetry metrics.
 *
 * Single source of truth — import METRIC_LABEL wherever a human-readable
 * name is needed. Field names (volt_in, ct_out, …) are unchanged in the
 * DB, MQTT payloads, and API responses.
 *
 * Electrical convention:
 *   Primary   = mains/input side  (before UPS transformer/inverter)
 *   Secondary = load/output side  (after UPS transformer/inverter)
 */

export const METRIC_LABEL: Record<string, string> = {
  // ── Voltage ──────────────────────────────────────────────────────────────
  volt_in:   "Primary Voltage",
  volt_out:  "Secondary Voltage",
  volt_dc:   "Battery Voltage",

  // ── Current ──────────────────────────────────────────────────────────────
  ct_in:     "Primary Current",
  ct_out:    "Secondary Current",

  // ── Apparent power ────────────────────────────────────────────────────────
  s_in_va:   "Primary Apparent Power",
  s_out_va:  "Secondary Apparent Power",

  // ── Real power ────────────────────────────────────────────────────────────
  p_in_w:    "Primary Active Power",
  p_out_w:   "Secondary Active Power",

  // ── Power factor ──────────────────────────────────────────────────────────
  pf_in:     "Primary Power Factor",
  pf_out:    "Secondary Power Factor",

  // ── Reactive power ────────────────────────────────────────────────────────
  q_in_var:  "Primary Reactive Power",
  q_out_var: "Secondary Reactive Power",

  // ── Energy ────────────────────────────────────────────────────────────────
  e_in_kwh:  "Primary Energy",
  e_out_kwh: "Secondary Energy",

  // ── Frequency ─────────────────────────────────────────────────────────────
  freq_in:   "Primary Frequency",
  freq_out:  "Secondary Frequency",

  // ── Other ─────────────────────────────────────────────────────────────────
  rssi:      "Signal Strength",
  offline:   "Device Offline",
};

/** Short labels for cards/charts where space is limited */
export const METRIC_LABEL_SHORT: Record<string, string> = {
  volt_in:   "Pri. Voltage",
  volt_out:  "Sec. Voltage",
  volt_dc:   "Battery V",
  ct_in:     "Pri. Current",
  ct_out:    "Sec. Current",
  s_in_va:   "Pri. VA",
  s_out_va:  "Sec. VA",
  p_in_w:    "Pri. Power",
  p_out_w:   "Sec. Power",
  pf_in:     "Pri. PF",
  pf_out:    "Sec. PF",
  q_in_var:  "Pri. VAR",
  q_out_var: "Sec. VAR",
  e_in_kwh:  "Pri. Energy",
  e_out_kwh: "Sec. Energy",
  freq_in:   "Pri. Freq",
  freq_out:  "Sec. Freq",
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
