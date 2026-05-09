"use client";

import { useEffect, useMemo, useState } from "react";

import mqtt from "mqtt";

export type TelemetryKey = "volt_in" | "volt_out" | "volt_dc" | "ct_in" | "ct_out";
export type MqttStatus = "connecting" | "connected" | "offline" | "error";

export type RawTelemetry = Record<TelemetryKey, number> & { ip?: string };

export type ParameterConfig = {
  label: string;
  unit: string;
  scale: number;
  offset: number;
  low: number;
  high: number;
  enabled: boolean;
};

export type ModuleConfig = {
  moduleName: string;
  brokerUrl: string;
  topic: string;
  parameters: Record<TelemetryKey, ParameterConfig>;
};

export type TelemetryRow = {
  key: TelemetryKey;
  raw: number;
  value: number;
  parameter: ParameterConfig;
  status: "normal" | "low" | "high" | "disabled";
};

export type Alarm = {
  key: TelemetryKey;
  label: string;
  value: number;
  limit: number;
  type: "LOW" | "HIGH";
  unit: string;
  time: string;
};

export type HistoryPoint = {
  time: string;
} & Record<TelemetryKey, number>;

export const expectedPublishIntervalMs = 500;

export const telemetryKeys: TelemetryKey[] = [
  "volt_in",
  "volt_out",
  "volt_dc",
  "ct_in",
  "ct_out",
];

export const defaultConfig: ModuleConfig = {
  moduleName: "VOLTAGETEST-01",
  brokerUrl: "wss://broker.hivemq.com:8884/mqtt",
  topic: "hadi/voltagetest/data",
  parameters: {
    volt_in: { label: "Input Voltage", unit: "V", scale: 1, offset: 0, low: 180, high: 250, enabled: true },
    volt_out: { label: "Output Voltage", unit: "V", scale: 1, offset: 0, low: 180, high: 250, enabled: true },
    volt_dc: { label: "Battery DC", unit: "V", scale: 0.0442, offset: 0, low: 20, high: 30, enabled: true },
    ct_in: { label: "Input Current", unit: "A", scale: 1, offset: 0, low: 0, high: 30, enabled: true },
    ct_out: { label: "Output Current", unit: "A", scale: 1, offset: 0, low: 0, high: 30, enabled: true },
  },
};

export const initialTelemetry: RawTelemetry = {
  volt_in: 0,
  volt_out: 0,
  volt_dc: 0,
  ct_in: 0,
  ct_out: 0,
  ip: "",
};

export function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function calibrate(raw: number, config: ParameterConfig) {
  return raw * config.scale + config.offset;
}

export function statusFor(value: number, config: ParameterConfig): TelemetryRow["status"] {
  if (!config.enabled) return "disabled";
  if (value < config.low) return "low";
  if (value > config.high) return "high";
  return "normal";
}

function readStoredConfig(): ModuleConfig {
  if (typeof window === "undefined") return defaultConfig;
  const raw = window.localStorage.getItem("voltagetest-config");
  if (!raw) return defaultConfig;

  try {
    const stored = JSON.parse(raw) as ModuleConfig;
    return {
      ...defaultConfig,
      ...stored,
      parameters: { ...defaultConfig.parameters, ...stored.parameters },
    };
  } catch {
    return defaultConfig;
  }
}

export function useTelemetry() {
  const [config, setConfig] = useState<ModuleConfig>(defaultConfig);
  const [telemetry, setTelemetry] = useState<RawTelemetry>(initialTelemetry);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [lastMessageAt, setLastMessageAt] = useState("");
  const [lastPayload, setLastPayload] = useState("");
  const [messageIntervalMs, setMessageIntervalMs] = useState<number | null>(null);
  const [mqttStatus, setMqttStatus] = useState<MqttStatus>("offline");
  const [parseError, setParseError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setConfig(readStoredConfig()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("voltagetest-config", JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    let cancelled = false;
    const statusTimer = window.setTimeout(() => {
      setMqttStatus("connecting");
      setParseError("");
    }, 0);

    const client = mqtt.connect(config.brokerUrl, {
      clientId: `voltagetest-web-${Math.random().toString(16).slice(2)}`,
      clean: true,
      connectTimeout: 7000,
      reconnectPeriod: 3000,
    });

    client.on("connect", () => {
      if (cancelled) return;
      setMqttStatus("connected");
      client.subscribe(config.topic, { qos: 0 });
    });
    client.on("reconnect", () => !cancelled && setMqttStatus("connecting"));
    client.on("offline", () => !cancelled && setMqttStatus("offline"));
    client.on("error", () => !cancelled && setMqttStatus("error"));
    client.on("message", (_topic, payload) => {
      try {
        const payloadText = payload.toString();
        const parsed = JSON.parse(payloadText) as Partial<RawTelemetry>;
        const next: RawTelemetry = {
          volt_in: Number(parsed.volt_in ?? 0),
          volt_out: Number(parsed.volt_out ?? 0),
          volt_dc: Number(parsed.volt_dc ?? 0),
          ct_in: Number(parsed.ct_in ?? 0),
          ct_out: Number(parsed.ct_out ?? 0),
          ip: parsed.ip ?? "",
        };
        const nowDate = new Date();
        const now = nowDate.toLocaleTimeString();
        setMessageIntervalMs((current) => {
          const previous = Number(window.sessionStorage.getItem("voltagetest-last-message-ms"));
          window.sessionStorage.setItem("voltagetest-last-message-ms", String(nowDate.getTime()));
          return previous ? nowDate.getTime() - previous : current;
        });
        setTelemetry(next);
        setLastMessageAt(now);
        setLastPayload(payloadText);
        setParseError("");
        setHistory((current) => [
          ...current.slice(-35),
          { time: now, ...next },
        ]);
      } catch {
        setParseError("Received MQTT message was not valid JSON.");
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(statusTimer);
      client.end(true);
    };
  }, [config.brokerUrl, config.topic]);

  const rows = useMemo<TelemetryRow[]>(
    () =>
      telemetryKeys.map((key) => {
        const parameter = config.parameters[key];
        const raw = telemetry[key];
        const value = calibrate(raw, parameter);
        return { key, raw, value, parameter, status: statusFor(value, parameter) };
      }),
    [config.parameters, telemetry],
  );

  const alarms = useMemo<Alarm[]>(
    () =>
      rows
        .filter((row) => row.status === "low" || row.status === "high")
        .map((row) => ({
          key: row.key,
          label: row.parameter.label,
          value: row.value,
          limit: row.status === "low" ? row.parameter.low : row.parameter.high,
          type: row.status === "low" ? "LOW" : "HIGH",
          unit: row.parameter.unit,
          time: lastMessageAt || "--",
        })),
    [lastMessageAt, rows],
  );

  return {
    alarms,
    config,
    history,
    lastMessageAt,
    lastPayload,
    messageIntervalMs,
    mqttStatus,
    parseError,
    rows,
    setConfig,
    telemetry,
  };
}
