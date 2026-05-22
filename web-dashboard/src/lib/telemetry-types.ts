export type TelemetryKey = "volt_in" | "volt_out" | "volt_dc" | "ct_in" | "ct_out";

export type RawTelemetry = Record<TelemetryKey, number> & {
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
  /** Raw ADC battery reading as received from the board (before any server-side calibration). */
  volt_dc_raw?: number;
  /**
   * Source of the volt_dc calibration applied by the server:
   *  - "server_profile"  — CalibrationProfile row found for this device
   *  - "server_default"  — no profile; default scale (0.0442) applied
   *  - "passthrough"     — no calibration applied (non-DB path)
   */
  volt_dc_calibration_source?: "server_profile" | "server_default" | "passthrough";
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
  };
}

export function telemetryDeviceId(telemetry: RawTelemetry) {
  return telemetry.device_id || telemetry.ups_id || telemetry.ip || "unassigned-device";
}

