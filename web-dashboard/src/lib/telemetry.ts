"use client";

import { useEffect, useMemo, useState } from "react";

import mqtt from "mqtt";

export type TelemetryKey = "volt_in" | "volt_out" | "volt_dc" | "ct_in" | "ct_out";
export type MqttStatus = "connecting" | "connected" | "offline" | "error";

export type RawTelemetry = Record<TelemetryKey, number> & {
  device_id?: string;
  firmware?: string;
  ip?: string;
  rssi?: number;
  s_in_va?: number;
  s_out_va?: number;
  site_id?: string;
  uptime_ms?: number;
  ups_id?: string;
};

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

export type FleetDevice = {
  alarms: Alarm[];
  id: string;
  inventory?: UpsInventoryItem;
  lastMessageAt: string;
  lastSeenMs: number;
  rows: TelemetryRow[];
  telemetry: RawTelemetry;
};

export type UpsInventoryItem = {
  batteryNominalV: number;
  capacityVa: number;
  deviceId: string;
  floor: string;
  id: string;
  location: string;
  serial: string;
  upsId: string;
};

export type SystemSettings = {
  rawRetentionDays: number;
  rollupRetentionMonths: number;
  alarmRetentionMonths: number;
};

export const expectedPublishIntervalMs = 500;

export const telemetryKeys: TelemetryKey[] = [
  "volt_in",
  "volt_out",
  "volt_dc",
  "ct_in",
  "ct_out",
];

export const defaultConfig: ModuleConfig = {
  moduleName: "UPSMON Fleet",
  brokerUrl: "wss://broker.hivemq.com:8884/mqtt",
  topic: "building/site-01/ups/+/telemetry",
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
  s_in_va: 0,
  s_out_va: 0,
  ip: "",
};

export const defaultInventory: UpsInventoryItem[] = [
  {
    batteryNominalV: 48,
    capacityVa: 3000,
    deviceId: "UPSMON-001",
    floor: "Ground",
    id: "ups-01",
    location: "Electrical Room",
    serial: "",
    upsId: "UPS-01",
  },
];

export const defaultSystemSettings: SystemSettings = {
  alarmRetentionMonths: 24,
  rawRetentionDays: 30,
  rollupRetentionMonths: 12,
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

function readStoredInventory(): UpsInventoryItem[] {
  if (typeof window === "undefined") return defaultInventory;
  const raw = window.localStorage.getItem("ups-inventory");
  if (!raw) return defaultInventory;

  try {
    const stored = JSON.parse(raw) as UpsInventoryItem[];
    return Array.isArray(stored) ? stored : defaultInventory;
  } catch {
    return defaultInventory;
  }
}

function normalizeTelemetry(parsed: Partial<RawTelemetry>): RawTelemetry {
  return {
    volt_in: Number(parsed.volt_in ?? 0),
    volt_out: Number(parsed.volt_out ?? 0),
    volt_dc: Number(parsed.volt_dc ?? 0),
    ct_in: Number(parsed.ct_in ?? 0),
    ct_out: Number(parsed.ct_out ?? 0),
    device_id: parsed.device_id,
    firmware: parsed.firmware,
    ip: parsed.ip ?? "",
    rssi: Number(parsed.rssi ?? 0),
    s_in_va: Number(parsed.s_in_va ?? 0),
    s_out_va: Number(parsed.s_out_va ?? 0),
    site_id: parsed.site_id,
    uptime_ms: Number(parsed.uptime_ms ?? 0),
    ups_id: parsed.ups_id,
  };
}

function rowsForTelemetry(telemetry: RawTelemetry, config: ModuleConfig): TelemetryRow[] {
  return telemetryKeys.map((key) => {
    const parameter = config.parameters[key];
    const raw = telemetry[key];
    const value = calibrate(raw, parameter);
    return { key, raw, value, parameter, status: statusFor(value, parameter) };
  });
}

function alarmsForRows(rows: TelemetryRow[], lastMessageAt: string): Alarm[] {
  return rows
    .filter((row) => row.status === "low" || row.status === "high")
    .map((row) => ({
      key: row.key,
      label: row.parameter.label,
      value: row.value,
      limit: row.status === "low" ? row.parameter.low : row.parameter.high,
      type: row.status === "low" ? "LOW" : "HIGH",
      unit: row.parameter.unit,
      time: lastMessageAt || "--",
    }));
}

export function useTelemetry() {
  const [config, setConfig] = useState<ModuleConfig>(defaultConfig);
  const [inventory, setInventory] = useState<UpsInventoryItem[]>(defaultInventory);
  const [inventoryLoaded, setInventoryLoaded] = useState(false);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(defaultSystemSettings);
  const [systemSettingsLoaded, setSystemSettingsLoaded] = useState(false);
  const [telemetry, setTelemetry] = useState<RawTelemetry>(initialTelemetry);
  const [fleet, setFleet] = useState<Record<string, FleetDevice>>({});
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [lastMessageAt, setLastMessageAt] = useState("");
  const [lastPayload, setLastPayload] = useState("");
  const [messageIntervalMs, setMessageIntervalMs] = useState<number | null>(null);
  const [mqttStatus, setMqttStatus] = useState<MqttStatus>("offline");
  const [parseError, setParseError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setConfig(readStoredConfig());
      setInventory(readStoredInventory());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSystemSettings() {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { settings?: SystemSettings };
        if (!cancelled && payload.settings) {
          setSystemSettings(payload.settings);
          setSystemSettingsLoaded(true);
        }
      } catch {
        if (!cancelled) setSystemSettingsLoaded(true);
      }
    }

    loadSystemSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInventory() {
      try {
        const response = await fetch("/api/inventory", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { inventory?: UpsInventoryItem[] };
        if (!cancelled && Array.isArray(payload.inventory)) {
          setInventory(payload.inventory);
          setInventoryLoaded(true);
        }
      } catch {
        if (!cancelled) setInventoryLoaded(true);
      }
    }

    loadInventory();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("voltagetest-config", JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    window.localStorage.setItem("ups-inventory", JSON.stringify(inventory));
    if (!inventoryLoaded) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch("/api/inventory", {
        body: JSON.stringify({ inventory }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
        signal: controller.signal,
      }).catch(() => undefined);
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [inventory, inventoryLoaded]);

  useEffect(() => {
    if (!systemSettingsLoaded) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch("/api/settings", {
        body: JSON.stringify({ settings: systemSettings }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
        signal: controller.signal,
      }).catch(() => undefined);
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [systemSettings, systemSettingsLoaded]);

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
        const next = normalizeTelemetry(parsed);
        const nowDate = new Date();
        const now = nowDate.toLocaleTimeString();
        const deviceId = next.device_id || next.ups_id || next.ip || "unassigned-device";
        const deviceRows = rowsForTelemetry(next, config);
        const deviceAlarms = alarmsForRows(deviceRows, now);
        setMessageIntervalMs((current) => {
          const previous = Number(window.sessionStorage.getItem("voltagetest-last-message-ms"));
          window.sessionStorage.setItem("voltagetest-last-message-ms", String(nowDate.getTime()));
          return previous ? nowDate.getTime() - previous : current;
        });
        setTelemetry(next);
        setFleet((current) => ({
          ...current,
          [deviceId]: {
            alarms: deviceAlarms,
            id: deviceId,
            lastMessageAt: now,
            lastSeenMs: nowDate.getTime(),
            rows: deviceRows,
            telemetry: next,
          },
        }));
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
  }, [config]);

  const rows = useMemo<TelemetryRow[]>(
    () => rowsForTelemetry(telemetry, config),
    [config, telemetry],
  );

  const alarms = useMemo<Alarm[]>(
    () => alarmsForRows(rows, lastMessageAt),
    [lastMessageAt, rows],
  );

  const fleetDevices = useMemo(
    () =>
      Object.values(fleet)
        .map((device) => ({
          ...device,
          inventory: inventory.find(
            (item) =>
              item.deviceId === device.telemetry.device_id ||
              item.upsId === device.telemetry.ups_id ||
              item.deviceId === device.id ||
              item.upsId === device.id,
          ),
        }))
        .sort((a, b) => (a.inventory?.upsId || a.id).localeCompare(b.inventory?.upsId || b.id)),
    [fleet, inventory],
  );

  return {
    alarms,
    config,
    fleetDevices,
    history,
    inventory,
    lastMessageAt,
    lastPayload,
    messageIntervalMs,
    mqttStatus,
    parseError,
    rows,
    setConfig,
    setInventory,
    setSystemSettings,
    systemSettings,
    telemetry,
  };
}
