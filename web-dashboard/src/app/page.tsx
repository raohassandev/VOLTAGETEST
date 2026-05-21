"use client";

import {
  Activity,
  AlertTriangle,
  Bell,
  BellOff,
  Cpu,
  Gauge,
  LayoutList,
  Settings,
  ShieldCheck,
  Volume2,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alarm,
  FleetDevice,
  SystemSettings,
  formatNumber,
  useTelemetry,
} from "@/lib/telemetry";


function UserAlarmPanel({ alarms }: { alarms: Alarm[] }) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const spokenAlarmKeysRef = useRef<Set<string>>(new Set());
  const lastSpeechAtRef = useRef(0);

  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    if (audioContextRef.current.state === "suspended") audioContextRef.current.resume();
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
      if (!activeKeys.has(key)) spokenAlarmKeysRef.current.delete(key);
    });
    const hasNewAlarm = alarms.some((alarm) => !spokenAlarmKeysRef.current.has(`${alarm.key}-${alarm.type}`));
    const now = Date.now();
    const shouldRepeat = now - lastSpeechAtRef.current >= 30000;
    if (!hasNewAlarm && !shouldRepeat) return;
    const alarmText = alarms
      .map((alarm) => `${alarm.label} ${alarm.type.toLowerCase()} alarm. Current value ${formatNumber(alarm.value)} ${alarm.unit}. Limit ${formatNumber(alarm.limit)} ${alarm.unit}.`)
      .join(" ");
    alarms.forEach((alarm) => spokenAlarmKeysRef.current.add(`${alarm.key}-${alarm.type}`));
    lastSpeechAtRef.current = now;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(alarmText);
    utterance.rate = 0.92;
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
            className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${soundEnabled ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700"}`}
            onClick={() => { setSoundEnabled((c) => !c); ensureAudioContext(); }}
            type="button"
          >
            {soundEnabled ? <Bell size={16} /> : <BellOff size={16} />}
            Sound
          </button>
          <button
            className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${speechEnabled ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700"}`}
            onClick={() => setSpeechEnabled((c) => !c)}
            type="button"
          >
            <Volume2 size={16} />
            Voice
          </button>
          <Link
            href="/alarms"
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            All alarms
          </Link>
          <span className={`inline-flex h-9 items-center rounded-full px-3 text-sm font-bold ${alarms.length ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
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
                <p className="font-semibold text-red-800">{alarm.label} {alarm.type}</p>
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

function FleetSummary({ devices, nowMs }: { devices: FleetDevice[]; nowMs: number }) {
  const online = devices.filter((d) => nowMs - d.lastSeenMs < 60_000).length;
  const alarming = devices.filter((d) => d.alarms.length > 0).length;
  const offline = devices.length - online;
  const totalVa = devices.reduce((sum, d) => sum + Number(d.telemetry.s_out_va ?? 0), 0);

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[
        { icon: Cpu, label: "UPS units", value: devices.length, tone: "bg-slate-100 text-slate-800" },
        { icon: Wifi, label: "Online", value: online, tone: "bg-emerald-50 text-emerald-700" },
        { icon: AlertTriangle, label: "Offline", value: offline, tone: offline ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700" },
        { icon: Gauge, label: "Output VA", value: formatNumber(totalVa), tone: "bg-blue-50 text-blue-700" },
      ].map((item) => {
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
      {alarming > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 shadow-sm sm:col-span-2 lg:col-span-4">
          <p className="text-sm font-bold text-red-700">
            <AlertTriangle size={14} className="mr-1 inline" />
            {alarming} UPS unit{alarming !== 1 ? "s" : ""} with active alarms —{" "}
            <Link href="/alarms" className="underline">
              View alarms
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}

function FleetTable({ devices, nowMs }: { devices: FleetDevice[]; nowMs: number }) {
  const [search, setSearch] = useState("");

  const filtered = devices.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (d.telemetry.ups_id ?? d.id).toLowerCase().includes(q) ||
      (d.telemetry.device_id ?? d.id).toLowerCase().includes(q) ||
      (d.inventory?.floor ?? "").toLowerCase().includes(q) ||
      (d.inventory?.location ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">UPS fleet</h2>
          <p className="text-sm text-slate-500">Live telemetry from all registered modules.</p>
        </div>
        <input
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:w-56"
          placeholder="Search UPS, device, location…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-3">UPS</th>
              <th className="py-2 pr-3">Device</th>
              <th className="py-2 pr-3">Location</th>
              <th className="py-2 pr-3">Input V</th>
              <th className="py-2 pr-3">Output V</th>
              <th className="py-2 pr-3">Battery V</th>
              <th className="py-2 pr-3">Output A</th>
              <th className="py-2 pr-3">Output VA</th>
              <th className="py-2 pr-3">Load %</th>
              <th className="py-2 pr-3">RSSI</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="py-5 text-slate-500" colSpan={12}>
                  {devices.length === 0 ? "Waiting for UPS telemetry." : "No results."}
                </td>
              </tr>
            ) : (
              filtered.map((device) => {
                const alarm = device.alarms.length > 0;
                const online = nowMs - device.lastSeenMs < 60_000;
                const upsId = device.inventory?.upsId || device.telemetry.ups_id || device.id;
                const capacityVa = device.inventory?.capacityVa ?? 0;
                const loadPct = capacityVa > 0 ? ((Number(device.telemetry.s_out_va ?? 0) / capacityVa) * 100) : null;

                return (
                  <tr key={device.id} className={`border-b border-slate-100 ${!online ? "opacity-60" : ""}`}>
                    <td className="py-3 pr-3 font-semibold">
                      <Link href={`/ups/${upsId}`} className="text-blue-700 hover:underline">
                        {upsId}
                      </Link>
                    </td>
                    <td className="py-3 pr-3 text-slate-600">{device.telemetry.device_id || device.id}</td>
                    <td className="py-3 pr-3 text-slate-500">
                      {[device.inventory?.floor, device.inventory?.location].filter(Boolean).join(" / ") || "--"}
                    </td>
                    <td className="py-3 pr-3">{formatNumber(device.telemetry.volt_in)}</td>
                    <td className="py-3 pr-3">{formatNumber(device.telemetry.volt_out)}</td>
                    <td className="py-3 pr-3">{formatNumber(device.telemetry.volt_dc)}</td>
                    <td className="py-3 pr-3">{formatNumber(device.telemetry.ct_out)}</td>
                    <td className="py-3 pr-3">{formatNumber(Number(device.telemetry.s_out_va ?? 0))}</td>
                    <td className="py-3 pr-3">
                      {loadPct !== null ? (
                        <span className={loadPct > 95 ? "font-bold text-red-700" : loadPct > 80 ? "font-semibold text-amber-700" : ""}>
                          {formatNumber(loadPct)}%
                        </span>
                      ) : "--"}
                    </td>
                    <td className="py-3 pr-3">{device.telemetry.rssi ? `${device.telemetry.rssi} dBm` : "--"}</td>
                    <td className="py-3 pr-3">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                        !online
                          ? "border-slate-200 bg-slate-100 text-slate-500"
                          : alarm
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}>
                        {!online ? "offline" : alarm ? `${device.alarms.length} alarms` : "normal"}
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

function ManufacturerSettings({
  settings,
  setSettings,
}: {
  settings: SystemSettings;
  setSettings: ReturnType<typeof useTelemetry>["setSystemSettings"];
}) {
  function update(field: keyof SystemSettings, value: string) {
    setSettings((current) => ({ ...current, [field]: Number(value) }));
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Manufacturer settings</h2>
          <p className="text-sm text-slate-500">Retention controls for history and alarm records.</p>
        </div>
        <Link href="/admin/settings" className="text-sm font-semibold text-blue-700 hover:underline">
          Advanced settings →
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Raw history days
          <input className="rounded-md border border-slate-300 px-3 py-2 font-normal" min={1} max={365} onChange={(e) => update("rawRetentionDays", e.target.value)} type="number" value={settings.rawRetentionDays} />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Rollup history months
          <input className="rounded-md border border-slate-300 px-3 py-2 font-normal" min={1} max={120} onChange={(e) => update("rollupRetentionMonths", e.target.value)} type="number" value={settings.rollupRetentionMonths} />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Alarm history months
          <input className="rounded-md border border-slate-300 px-3 py-2 font-normal" min={1} max={120} onChange={(e) => update("alarmRetentionMonths", e.target.value)} type="number" value={settings.alarmRetentionMonths} />
        </label>
      </div>
    </section>
  );
}

export default function Home() {
  const { fleetDevices, apiStatus, setSystemSettings, systemSettings } =
    useTelemetry();
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Fleet-wide alarms derived from all devices — source of truth for alarm display.
  const fleetAlarms = fleetDevices.flatMap((d) => d.alarms);

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
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Live power protection</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight">UPS Monitoring System</h1>
                <p className="mt-1 text-sm font-medium text-slate-500">Fleet management</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className={`flex items-center gap-2 rounded-md px-3 py-2 font-semibold ${apiStatus === "ok" ? "bg-emerald-50 text-emerald-700" : apiStatus === "degraded" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                <Activity size={16} /> {apiStatus === "ok" ? "API online" : apiStatus === "degraded" ? "API error" : "API unknown"}
              </span>
              <span className={`flex items-center gap-2 rounded-md px-3 py-2 font-semibold ${fleetAlarms.length ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"}`}>
                <AlertTriangle size={16} /> {fleetAlarms.length} alarms
              </span>
              <Link href="/alarms" className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-200">
                <Bell size={16} /> Alarm log
              </Link>
              <Link href="/admin/inventory" className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-200">
                <LayoutList size={16} /> Inventory
              </Link>
              <Link href="/admin/settings" className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-200">
                <Settings size={16} /> Settings
              </Link>
              <form action="/api/logout" method="post">
                <button className="h-full w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>

        <FleetSummary devices={fleetDevices} nowMs={nowMs} />
        <FleetTable devices={fleetDevices} nowMs={nowMs} />

        <UserAlarmPanel alarms={fleetAlarms} />

        <ManufacturerSettings settings={systemSettings} setSettings={setSystemSettings} />
      </div>
    </main>
  );
}
