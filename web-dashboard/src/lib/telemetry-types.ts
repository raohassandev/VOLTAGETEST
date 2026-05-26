export type TelemetryKey =
  | "volt_in"
  | "volt_out"
  | "volt_dc"
  | "ct_in"
  | "ct_out"
  | "freq_in"
  | "freq_out"
  | "p_in_w"
  | "p_out_w"
  | "pf_in"
  | "pf_out"
  | "q_in_var"
  | "q_out_var"
  | "e_in_kwh"
  | "e_out_kwh";

export type RawTelemetry = Record<"volt_in" | "volt_out" | "volt_dc" | "ct_in" | "ct_out", number> & {
  device_id?: string;
  firmware?: string;
  ip?: string;
  received_at?: string;
  rssi?: number;
  s_in_va?: number;
  s_out_va?: number;
  site_id?: string;
  topic?: string;
  uptime_ms?: number;
  ups_id?: string;
  /**
   * v1.0.0 firmware publishes volt_dc already calibrated in volts.
   * Server must NOT apply battery scaling to volt_dc.
   * If legacy raw-ADC support is needed later, use a separate volt_dc_raw field.
   * @deprecated volt_dc_raw and volt_dc_calibration_source are no longer used in v1.0.0.
   */
  volt_dc_raw?: number;
  /** @deprecated Removed in v1.0.0 â€” server no longer applies volt_dc scaling. */
  volt_dc_calibration_source?: "server_profile" | "server_default" | "passthrough";
  // Energy analyzer fields (null when firmware does not support or no waveform)
  freq_in?: number | null;
  freq_out?: number | null;
  p_in_w?: number | null;
  p_out_w?: number | null;
  pf_in?: number | null;
  pf_out?: number | null;
  q_in_var?: number | null;
  q_out_var?: number | null;
  e_in_kwh?: number | null;
  e_out_kwh?: number | null;
};

export type TelemetryStore = {
  history: Record<string, RawTelemetry[]>;
  latest: Record<string, RawTelemetry>;
};

export const telemetryKeys: TelemetryKey[] = [
  "volt_in",
  "volt_out",
  "volt_dc",
  "ct_in",
  "ct_out",
  "freq_in",
  "freq_out",
  "p_in_w",
  "p_out_w",
  "pf_in",
  "pf_out",
  "q_in_var",
  "q_out_var",
  "e_in_kwh",
  "e_out_kwh",
];

export const initialTelemetry: RawTelemetry = {
  ct_in: 0,
  ct_out: 0,
  ip: "",
  s_in_va: 0,
  s_out_va: 0,
  volt_dc: 0,
  volt_in: 0,
  volt_out: 0,
  freq_in: null,
  freq_out: null,
  p_in_w: null,
  p_out_w: null,
  pf_in: null,
  pf_out: null,
  q_in_var: null,
  q_out_var: null,
  e_in_kwh: null,
  e_out_kwh: null,
};

export function normalizeTelemetry(parsed: Partial<RawTelemetry>, topic = ""): RawTelemetry {
  return {
    ct_in: Number(parsed.ct_in ?? 0),
    ct_out: Number(parsed.ct_out ?? 0),
    device_id: parsed.device_id,
    firmware: parsed.firmware,
    ip: parsed.ip ?? "",
    received_at: parsed.received_at,
    rssi: Number(parsed.rssi ?? 0),
    s_in_va: Number(parsed.s_in_va ?? 0),
    s_out_va: Number(parsed.s_out_va ?? 0),
    site_id: parsed.site_id,
    topic,
    uptime_ms: Number(parsed.uptime_ms ?? 0),
    ups_id: parsed.ups_id,
    volt_dc: Number(parsed.volt_dc ?? 0),
    volt_in: Number(parsed.volt_in ?? 0),
    volt_out: Number(parsed.volt_out ?? 0),
    freq_in:   parsed.freq_in   !== undefined ? parsed.freq_in   : null,
    freq_out:  parsed.freq_out  !== undefined ? parsed.freq_out  : null,
    p_in_w:    parsed.p_in_w    !== undefined ? parsed.p_in_w    : null,
    p_out_w:   parsed.p_out_w   !== undefined ? parsed.p_out_w   : null,
    pf_in:     parsed.pf_in     !== undefined ? parsed.pf_in     : null,
    pf_out:    parsed.pf_out    !== undefined ? parsed.pf_out    : null,
    q_in_var:  parsed.q_in_var  !== undefined ? parsed.q_in_var  : null,
    q_out_var: parsed.q_out_var !== undefined ? parsed.q_out_var : null,
    e_in_kwh:  parsed.e_in_kwh  !== undefined ? parsed.e_in_kwh  : null,
    e_out_kwh: parsed.e_out_kwh !== undefined ? parsed.e_out_kwh : null,
  };
}

export function telemetryDeviceId(telemetry: RawTelemetry) {
  return telemetry.device_id || telemetry.ups_id || telemetry.ip || "unassigned-device";
}
