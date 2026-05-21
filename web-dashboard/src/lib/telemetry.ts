"use client";

import { useEffect, useMemo, useState } from "react";

import {
  normalizeTelemetry,
  telemetryKeys,
  type RawTelemetry,
  type TelemetryKey,
} from "@/lib/telemetry-types";

export type ApiStatus = "ok" | "degraded" | "unknown";
export type { RawTelemetry, TelemetryKey } from "@/lib/telemetry-types";

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

export type ServerAlarm = {
  id: string;
  deviceId: string;
  upsId: string | null;
  metric: string;
  severity: string;
  message: string;
  firstSeenAt: string;
  lastSeenAt: string;
};

export const expectedPublishIntervalMs = 5000;

export { telemetryKeys } from "@/lib/telemetry-types";

export const defaultConfig: ModuleConfig = {
  moduleName: "UPSMON Fleet",
  topic: "building/site-01/ups/+/telemetry",
  parameters: {
    volt_in: { label: "Input Voltage", unit: "V", scale: 1, offset: 0, low: 180, high: 250, enabled: true },
    volt_out: { label: "Output Voltage", unit: "V", scale: 1, offset: 0, low: 180, high: 250, enabled: true },
    volt_dc: { label: "Battery DC", unit: "V", scale: 0.0442, offset: 0, low: 20, high: 30, enabled: true },
    ct_in: { label: "Input Current", unit: "A", scale: 1, offset: 0, low: 0, high: 30, enabled: true },
    ct_out: { label: "Output Current", unit: "A", scale: 1, offset: 0, low: 0, high: 30, enabled: true },
  },
};

export { initialTelemetry } from "@/lib/telemetry-types";

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
  const [fleet, setFleet] = useState<Record<string, FleetDevice>>({});
  const [apiStatus, setApiStatus] = useState<ApiStatus>("unknown");
  const [serverAlarms, setServerAlarms] = useState<ServerAlarm[]>([]);

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
    let cancelled = false;

    async function loadLatestTelemetry() {
      try {
        const response = await fetch("/api/telemetry/latest", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { latest?: Record<string, RawTelemetry> };
        if (cancelled || !payload.latest) return;

        const nowDate = new Date();
        const now = nowDate.toLocaleTimeString();
        setFleet((current) => {
          const nextFleet = { ...current };

          Object.entries(payload.latest || {}).forEach(([deviceId, item]) => {
            const next = normalizeTelemetry(item, item.topic);
            const deviceRows = rowsForTelemetry(next, config);
            nextFleet[deviceId] = {
              alarms: alarmsForRows(deviceRows, now),
              id: deviceId,
              lastMessageAt: item.received_at ? new Date(item.received_at).toLocaleTimeString() : now,
              lastSeenMs: item.received_at ? new Date(item.received_at).getTime() : nowDate.getTime(),
              rows: deviceRows,
              telemetry: next,
            };
          });

          return nextFleet;
        });
      } catch {
        // API unreachable — fleet state unchanged until next poll.
      }
    }

    loadLatestTelemetry();
    const timer = window.setInterval(loadLatestTelemetry, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
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

    async function pollHealth() {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!cancelled) {
          const body = (await res.json()) as { status?: string };
          setApiStatus(body.status === "ok" ? "ok" : "degraded");
        }
      } catch {
        if (!cancelled) setApiStatus("degraded");
      }
    }

    pollHealth();
    const timer = window.setInterval(pollHealth, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function pollServerAlarms() {
      try {
        const res = await fetch("/api/alarms?state=active&limit=100", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { alarms?: ServerAlarm[] };
        if (!cancelled) setServerAlarms(data.alarms ?? []);
      } catch {
        // leave existing state unchanged
      }
    }

    pollServerAlarms();
    const timer = window.setInterval(pollServerAlarms, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

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
    apiStatus,
    config,
    fleetDevices,
    inventory,
    serverAlarms,
    setConfig,
    setInventory,
    setSystemSettings,
    systemSettings,
  };
}
