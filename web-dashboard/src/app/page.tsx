"use client";

import { AlertTriangle, BatteryCharging, Bell, BellOff, Bolt, Cpu, Gauge, Plus, ShieldCheck, Trash2, Volume2, Wifi } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alarm,
  FleetDevice,
  TelemetryKey,
  TelemetryRow,
  SystemSettings,
  UpsInventoryItem,
  formatNumber,
  telemetryKeys,
  useTelemetry,
} from "@/lib/telemetry";

const chartKeys: TelemetryKey[] = ["volt_in", "volt_out", "volt_dc"];
const chartColors: Record<TelemetryKey, string> = {
  volt_in: "#2563eb",
  volt_out: "#16a34a",
  volt_dc: "#f59e0b",
  ct_in: "#9333ea",
  ct_out: "#dc2626",
};

function gaugePercent(row: TelemetryRow) {
  const { low, high } = row.parameter;
  const span = Math.max(high - low, 1);
  return Math.max(0, Math.min(100, ((row.value - low) / span) * 100));
}

function statusClass(status: TelemetryRow["status"]) {
  if (status === "normal") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "disabled") return "border-slate-200 bg-slate-100 text-slate-500";
  return "border-red-200 bg-red-50 text-red-700";
}

function MiniGauge({ row }: { row: TelemetryRow }) {
  const percent = gaugePercent(row);
  const alarm = row.status === "low" || row.status === "high";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">{row.parameter.label}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">
            {formatNumber(row.value)}
            <span className="ml-1 text-base text-slate-500">{row.parameter.unit}</span>
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold capitalize ${statusClass(row.status)}`}>
          {row.status.toUpperCase()}
        </span>
      </div>

      <div className="mt-6">
        <div className="h-3 rounded-full bg-slate-100">
          <div
            className={`h-3 rounded-full ${alarm ? "bg-red-500" : "bg-emerald-500"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs font-medium text-slate-500">
          <span>{formatNumber(row.parameter.low)}</span>
          <span>{formatNumber(row.parameter.high)}</span>
        </div>
      </div>
    </section>
  );
}

function TrendChart({
  history,
  rows,
}: {
  history: ReturnType<typeof useTelemetry>["history"];
  rows: TelemetryRow[];
}) {
  const width = 900;
  const height = 260;
  const padding = 28;
  const rowByKey = Object.fromEntries(rows.map((row) => [row.key, row]));

  const points = chartKeys.map((key) => {
    const row = rowByKey[key] as TelemetryRow;
    const values = history.map((item) => item[key] * row.parameter.scale + row.parameter.offset);
    const min = Math.min(row.parameter.low, ...values);
    const max = Math.max(row.parameter.high, ...values);
    const span = Math.max(max - min, 1);
    const path = values
      .map((value, index) => {
        const x =
          padding +
          (index / Math.max(history.length - 1, 1)) * (width - padding * 2);
        const y = height - padding - ((value - min) / span) * (height - padding * 2);
        return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
    return { key, path, label: row.parameter.label };
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Live voltage trend</h2>
          <p className="text-sm text-slate-500">Live trend from the connected power monitor.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {points.map((point) => (
            <span key={point.key} className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: chartColors[point.key] }} />
              {point.label}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-md border border-slate-100 bg-white">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[260px] w-full">
          {[0, 1, 2, 3].map((line) => (
            <line
              key={line}
              x1={padding}
              x2={width - padding}
              y1={padding + line * 64}
              y2={padding + line * 64}
              stroke="#e2e8f0"
            />
          ))}
          {history.length < 2 ? (
            <text x="50%" y="50%" textAnchor="middle" fill="#64748b" fontSize="16">
              Waiting for live MQTT telemetry
            </text>
          ) : (
            points.map((point) => (
              <path
                key={point.key}
                d={point.path}
                fill="none"
                stroke={chartColors[point.key]}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="4"
              />
            ))
          )}
        </svg>
      </div>
    </section>
  );
}

function UserAlarmPanel({ alarms }: { alarms: Alarm[] }) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const spokenAlarmKeysRef = useRef<Set<string>>(new Set());
  const lastSpeechAtRef = useRef(0);

  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

  const playAlarmTone = useCallback(() => {
    const context = ensureAudioContext();

    [0, 0.28].forEach((offset) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + offset;
      const stop = start + 0.18;

      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(760, start);
      oscillator.frequency.setValueAtTime(960, start + 0.09);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, stop);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(stop);
    });
  }, [ensureAudioContext]);

  useEffect(() => {
    if (!soundEnabled || alarms.length === 0) return;

    playAlarmTone();
    const timer = window.setInterval(playAlarmTone, 2500);
    return () => window.clearInterval(timer);
  }, [alarms.length, playAlarmTone, soundEnabled]);

  useEffect(() => {
    if (!speechEnabled || alarms.length === 0 || !("speechSynthesis" in window)) return;

    const activeKeys = new Set(alarms.map((alarm) => `${alarm.key}-${alarm.type}`));
    spokenAlarmKeysRef.current.forEach((key) => {
      if (!activeKeys.has(key)) {
        spokenAlarmKeysRef.current.delete(key);
      }
    });

    const hasNewAlarm = alarms.some(
      (alarm) => !spokenAlarmKeysRef.current.has(`${alarm.key}-${alarm.type}`),
    );
    const now = Date.now();
    const shouldRepeat = now - lastSpeechAtRef.current >= 30000;

    if (!hasNewAlarm && !shouldRepeat) return;

    const alarmText = alarms
      .map(
        (alarm) =>
          `${alarm.label} ${alarm.type.toLowerCase()} alarm. Current value ${formatNumber(alarm.value)} ${alarm.unit}. Limit ${formatNumber(alarm.limit)} ${alarm.unit}.`,
      )
      .join(" ");

    alarms.forEach((alarm) => spokenAlarmKeysRef.current.add(`${alarm.key}-${alarm.type}`));
    lastSpeechAtRef.current = now;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(alarmText);
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  }, [alarms, speechEnabled]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Alarms</h2>
          <p className="text-sm text-slate-500">Active high and low limit conditions.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${
              soundEnabled ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
            onClick={() => {
              setSoundEnabled((current) => !current);
              ensureAudioContext();
            }}
            type="button"
          >
            {soundEnabled ? <Bell size={16} /> : <BellOff size={16} />}
            Sound
          </button>
          <button
            className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${
              speechEnabled ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
            onClick={() => setSpeechEnabled((current) => !current)}
            type="button"
          >
            <Volume2 size={16} />
            Voice
          </button>
          <span
            className={`inline-flex h-9 items-center rounded-full px-3 text-sm font-bold ${
              alarms.length ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {alarms.length ? `${alarms.length} active` : "All normal"}
          </span>
        </div>
      </div>

      {alarms.length === 0 ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          No active alarms.
        </div>
      ) : (
        <div className="grid gap-3">
          {alarms.map((alarm) => (
            <div
              key={alarm.key}
              className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-red-800">
                  {alarm.label} {alarm.type}
                </p>
                <p className="text-sm text-red-700">
                  {formatNumber(alarm.value)} {alarm.unit} limit {formatNumber(alarm.limit)} {alarm.unit}
                </p>
              </div>
              <span className="text-sm font-semibold text-red-700">{alarm.time}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function UserThresholdConfig({
  rows,
  setConfig,
}: {
  rows: TelemetryRow[];
  setConfig: ReturnType<typeof useTelemetry>["setConfig"];
}) {
  function updateLimit(key: TelemetryKey, field: "low" | "high", value: string) {
    setConfig((current) => ({
      ...current,
      parameters: {
        ...current.parameters,
        [key]: {
          ...current.parameters[key],
          [field]: Number(value),
        },
      },
    }));
  }

  function updateEnabled(key: TelemetryKey, enabled: boolean) {
    setConfig((current) => ({
      ...current,
      parameters: {
        ...current.parameters,
        [key]: {
          ...current.parameters[key],
          enabled,
        },
      },
    }));
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-950">Alarm limits</h2>
        <p className="text-sm text-slate-500">Adjust low and high limits for each live value.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-3">Active</th>
              <th className="py-2 pr-3">Parameter</th>
              <th className="py-2 pr-3">Current</th>
              <th className="py-2 pr-3">Low limit</th>
              <th className="py-2 pr-3">High limit</th>
              <th className="py-2 pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-slate-100">
                <td className="py-3 pr-3">
                  <input
                    checked={row.parameter.enabled}
                    onChange={(event) => updateEnabled(row.key, event.target.checked)}
                    type="checkbox"
                  />
                </td>
                <td className="py-3 pr-3 font-semibold">{row.parameter.label}</td>
                <td className="py-3 pr-3">
                  {formatNumber(row.value)} {row.parameter.unit}
                </td>
                <td className="py-3 pr-3">
                  <input
                    className="w-28 rounded-md border border-slate-300 px-2 py-1.5"
                    onChange={(event) => updateLimit(row.key, "low", event.target.value)}
                    step="0.01"
                    type="number"
                    value={row.parameter.low}
                  />
                </td>
                <td className="py-3 pr-3">
                  <input
                    className="w-28 rounded-md border border-slate-300 px-2 py-1.5"
                    onChange={(event) => updateLimit(row.key, "high", event.target.value)}
                    step="0.01"
                    type="number"
                    value={row.parameter.high}
                  />
                </td>
                <td className="py-3 pr-3">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(row.status)}`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FleetSummary({ devices, nowMs }: { devices: FleetDevice[]; nowMs: number }) {
  const online = devices.filter((device) => nowMs - device.lastSeenMs < 30000).length;
  const alarming = devices.filter((device) => device.alarms.length > 0).length;
  const totalVa = devices.reduce((sum, device) => sum + Number(device.telemetry.s_out_va ?? 0), 0);

  const items = [
    { icon: Cpu, label: "UPS units", value: devices.length, tone: "bg-slate-100 text-slate-800" },
    { icon: Wifi, label: "Online", value: online, tone: "bg-emerald-50 text-emerald-700" },
    { icon: AlertTriangle, label: "Alarming", value: alarming, tone: alarming ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700" },
    { icon: Gauge, label: "Output VA", value: formatNumber(totalVa), tone: "bg-blue-50 text-blue-700" },
  ];

  return (
    <section className="grid gap-3 md:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md ${item.tone}`}>
              <Icon size={18} />
            </div>
            <p className="text-sm font-semibold text-slate-500">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{item.value}</p>
          </div>
        );
      })}
    </section>
  );
}

function FleetTable({ devices }: { devices: FleetDevice[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-950">UPS fleet</h2>
        <p className="text-sm text-slate-500">Live modules received from MQTT telemetry.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-3">UPS</th>
              <th className="py-2 pr-3">Device</th>
              <th className="py-2 pr-3">Input V</th>
              <th className="py-2 pr-3">Output V</th>
              <th className="py-2 pr-3">Battery V</th>
              <th className="py-2 pr-3">Output A</th>
              <th className="py-2 pr-3">Output VA</th>
              <th className="py-2 pr-3">RSSI</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {devices.length === 0 ? (
              <tr>
                <td className="py-5 text-slate-500" colSpan={10}>
                  Waiting for UPS telemetry.
                </td>
              </tr>
            ) : (
              devices.map((device) => {
                const alarm = device.alarms.length > 0;
                return (
                  <tr key={device.id} className="border-b border-slate-100">
                    <td className="py-3 pr-3 font-semibold">{device.inventory?.upsId || device.telemetry.ups_id || device.id}</td>
                    <td className="py-3 pr-3 text-slate-600">{device.telemetry.device_id || device.id}</td>
                    <td className="py-3 pr-3">{formatNumber(device.telemetry.volt_in)}</td>
                    <td className="py-3 pr-3">{formatNumber(device.telemetry.volt_out)}</td>
                    <td className="py-3 pr-3">{formatNumber(device.telemetry.volt_dc)}</td>
                    <td className="py-3 pr-3">{formatNumber(device.telemetry.ct_out)}</td>
                    <td className="py-3 pr-3">{formatNumber(Number(device.telemetry.s_out_va ?? 0))}</td>
                    <td className="py-3 pr-3">{device.telemetry.rssi ? `${device.telemetry.rssi} dBm` : "--"}</td>
                    <td className="py-3 pr-3">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${alarm ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                        {alarm ? `${device.alarms.length} alarms` : "normal"}
                      </span>
                    </td>
                    <td className="py-3 pr-3">{device.lastMessageAt}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function InventoryManager({
  inventory,
  setInventory,
}: {
  inventory: UpsInventoryItem[];
  setInventory: ReturnType<typeof useTelemetry>["setInventory"];
}) {
  const emptyForm: UpsInventoryItem = {
    batteryNominalV: 48,
    capacityVa: 3000,
    deviceId: "",
    floor: "",
    id: "",
    location: "",
    serial: "",
    upsId: "",
  };
  const [form, setForm] = useState<UpsInventoryItem>(emptyForm);

  function update(field: keyof UpsInventoryItem, value: string) {
    setForm((current) => ({
      ...current,
      [field]: field === "batteryNominalV" || field === "capacityVa" ? Number(value) : value,
    }));
  }

  function save() {
    const id = form.id || form.upsId || crypto.randomUUID();
    const next = { ...form, id };

    if (!next.upsId || !next.deviceId) return;

    setInventory((current) => {
      const existing = current.some((item) => item.id === id || item.upsId === next.upsId);
      if (existing) {
        return current.map((item) => (item.id === id || item.upsId === next.upsId ? next : item));
      }
      return [...current, next];
    });
    setForm(emptyForm);
  }

  function edit(item: UpsInventoryItem) {
    setForm(item);
  }

  function remove(id: string) {
    setInventory((current) => current.filter((item) => item.id !== id));
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-950">UPS inventory</h2>
        <p className="text-sm text-slate-500">Manage UPS identity and location records.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => update("upsId", event.target.value)} placeholder="UPS ID" value={form.upsId} />
        <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => update("deviceId", event.target.value)} placeholder="Device ID" value={form.deviceId} />
        <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => update("serial", event.target.value)} placeholder="Serial" value={form.serial} />
        <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => update("floor", event.target.value)} placeholder="Floor" value={form.floor} />
        <input className="rounded-md border border-slate-300 px-3 py-2 text-sm lg:col-span-2" onChange={(event) => update("location", event.target.value)} placeholder="Location" value={form.location} />
        <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => update("capacityVa", event.target.value)} placeholder="Capacity VA" type="number" value={form.capacityVa} />
        <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" onChange={(event) => update("batteryNominalV", event.target.value)} placeholder="Battery V" type="number" value={form.batteryNominalV} />
      </div>
      <button className="mt-3 inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white" onClick={save} type="button">
        <Plus size={16} />
        Save UPS
      </button>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-3">UPS</th>
              <th className="py-2 pr-3">Device</th>
              <th className="py-2 pr-3">Location</th>
              <th className="py-2 pr-3">Capacity</th>
              <th className="py-2 pr-3">Battery</th>
              <th className="py-2 pr-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((item) => (
              <tr key={item.id} className="border-b border-slate-100">
                <td className="py-3 pr-3 font-semibold">{item.upsId}</td>
                <td className="py-3 pr-3">{item.deviceId}</td>
                <td className="py-3 pr-3">{[item.floor, item.location].filter(Boolean).join(" / ") || "--"}</td>
                <td className="py-3 pr-3">{formatNumber(item.capacityVa)} VA</td>
                <td className="py-3 pr-3">{formatNumber(item.batteryNominalV)} V</td>
                <td className="py-3 pr-3">
                  <div className="flex gap-2">
                    <button className="rounded-md border border-slate-300 px-2 py-1 font-semibold" onClick={() => edit(item)} type="button">
                      Edit
                    </button>
                    <button className="inline-flex items-center rounded-md border border-red-200 px-2 py-1 text-red-700" onClick={() => remove(item.id)} type="button">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ManufacturerSettings({
  settings,
  setSettings,
}: {
  settings: SystemSettings;
  setSettings: ReturnType<typeof useTelemetry>["setSystemSettings"];
}) {
  function update(field: keyof SystemSettings, value: string) {
    setSettings((current) => ({
      ...current,
      [field]: Number(value),
    }));
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-950">Manufacturer settings</h2>
        <p className="text-sm text-slate-500">Retention controls for history and alarm records.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Raw history days
          <input
            className="rounded-md border border-slate-300 px-3 py-2 font-normal"
            min={1}
            max={365}
            onChange={(event) => update("rawRetentionDays", event.target.value)}
            type="number"
            value={settings.rawRetentionDays}
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Rollup history months
          <input
            className="rounded-md border border-slate-300 px-3 py-2 font-normal"
            min={1}
            max={120}
            onChange={(event) => update("rollupRetentionMonths", event.target.value)}
            type="number"
            value={settings.rollupRetentionMonths}
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Alarm history months
          <input
            className="rounded-md border border-slate-300 px-3 py-2 font-normal"
            min={1}
            max={120}
            onChange={(event) => update("alarmRetentionMonths", event.target.value)}
            type="number"
            value={settings.alarmRetentionMonths}
          />
        </label>
      </div>
    </section>
  );
}

export default function Home() {
  const { alarms, config, fleetDevices, history, inventory, lastMessageAt, mqttStatus, parseError, rows, setConfig, setInventory, setSystemSettings, systemSettings, telemetry } =
    useTelemetry();
  const [nowMs, setNowMs] = useState(0);
  const input = rows.find((row) => row.key === "volt_in");
  const output = rows.find((row) => row.key === "volt_out");
  const battery = rows.find((row) => row.key === "volt_dc");
  const currentRows = rows.filter((row) => row.key === "ct_in" || row.key === "ct_out");

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-950 text-white">
                <ShieldCheck size={28} />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Live power protection
                </p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight">UPS Monitoring System</h1>
                <p className="mt-1 text-sm font-medium text-slate-500">{config.moduleName}</p>
              </div>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-4">
              <span className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 font-semibold text-emerald-700">
                <Wifi size={16} /> {mqttStatus === "connected" ? "Online" : "Connecting"}
              </span>
              <span className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 font-semibold text-blue-700">
                <BatteryCharging size={16} /> {telemetry.ip ? "Module detected" : "Waiting for module"}
              </span>
              <span className={`flex items-center gap-2 rounded-md px-3 py-2 font-semibold ${alarms.length ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"}`}>
                <AlertTriangle size={16} /> {alarms.length} alarms
              </span>
              <form action="/api/logout" method="post">
                <button
                  className="h-full w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700"
                  type="submit"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>

        <FleetSummary devices={fleetDevices} nowMs={nowMs} />

        <FleetTable devices={fleetDevices} />

        <InventoryManager inventory={inventory} setInventory={setInventory} />

        <ManufacturerSettings settings={systemSettings} setSettings={setSystemSettings} />

        {parseError ? (
          <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            Live data is temporarily unavailable.
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          {input ? <MiniGauge row={input} /> : null}
          {output ? <MiniGauge row={output} /> : null}
          {battery ? <MiniGauge row={battery} /> : null}
        </section>

        <TrendChart history={history} rows={rows} />

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <UserAlarmPanel alarms={alarms} />
          <UserThresholdConfig rows={rows} setConfig={setConfig} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Bolt size={20} className="text-slate-500" />
              <h2 className="text-lg font-semibold">Current transformers</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {currentRows.map((row) => (
                <div key={row.key} className="rounded-md border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-500">{row.parameter.label}</p>
                  <p className="mt-2 text-3xl font-semibold">
                    {formatNumber(row.value)}
                    <span className="ml-1 text-base text-slate-500">{row.parameter.unit}</span>
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <BatteryCharging size={20} className="text-slate-500" />
              <h2 className="text-lg font-semibold">System status</h2>
            </div>
            <div className="grid gap-3 text-sm">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Last update</span>
                <span className="font-semibold">{lastMessageAt || "Waiting for data"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Healthy channels</span>
                <span className="font-semibold">
                  {rows.filter((row) => row.status === "normal").length}/{telemetryKeys.length}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Firmware</span>
                <span className="font-semibold">{telemetry.firmware || "--"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">RSSI</span>
                <span className="font-semibold">{telemetry.rssi ? `${telemetry.rssi} dBm` : "--"}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Input apparent power</span>
                <span className="font-semibold">{formatNumber(Number(telemetry.s_in_va ?? 0))} VA</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Output apparent power</span>
                <span className="font-semibold">{formatNumber(Number(telemetry.s_out_va ?? 0))} VA</span>
              </div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
