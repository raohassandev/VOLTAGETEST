"use client";

import { AlertTriangle, ArrowLeft, BatteryCharging, Cpu, Gauge, MapPin, Radio, RefreshCw, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface UpsDetail {
  unit: {
    id: string;
    upsId: string;
    name: string;
    serial: string;
    floor: string;
    location: string;
    capacityVa: number;
    batteryNominalV: number;
    notes: string;
  };
  device: {
    deviceId: string;
    ip: string | null;
    mac: string | null;
    firmware: string | null;
    online: boolean;
    lastSeenAt: string | null;
  } | null;
  telemetry: {
    voltIn: number;
    voltOut: number;
    voltDc: number;
    ctIn: number;
    ctOut: number;
    sInVa: number;
    sOutVa: number;
    rssi: number | null;
    firmware: string | null;
    receivedAt: string;
    loadPct: number | null;
    pInW: null;
    pOutW: null;
    pfIn: null;
    pfOut: null;
    eInKwh: null;
    eOutKwh: null;
  } | null;
  commissioning: {
    seq: number | null;
    freeHeap: number | null;
    resetReason: string | null;
    mqttConnected: boolean | null;
    wifiMode: string | null;
    configMode: boolean | null;
    setupApEnabled: boolean | null;
    building: string | null;
    floor: string | null;
    section: string | null;
    workArea: string | null;
    location: string | null;
  } | null;
  activeAlarms: AlarmRecord[];
  alarmHistory: AlarmRecord[];
}

interface AlarmRecord {
  id: string;
  metric: string;
  severity: string;
  state: string;
  message: string;
  firstSeenAt: string;
  lastSeenAt: string;
  clearedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  comment: string | null;
}

function fmt(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  return v.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

function MetricCard({
  label,
  value,
  unit,
  warn,
  danger,
}: {
  label: string;
  value: string;
  unit: string;
  warn?: boolean;
  danger?: boolean;
}) {
  const tone = danger
    ? "border-red-200 bg-red-50"
    : warn
    ? "border-amber-200 bg-amber-50"
    : "border-slate-200 bg-white";

  return (
    <div className={`rounded-lg border p-4 shadow-sm ${tone}`}>
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">
        {value}
        <span className="ml-1 text-sm font-normal text-slate-500">{unit}</span>
      </p>
    </div>
  );
}

function AlarmRow({ alarm, onAck }: { alarm: AlarmRecord; onAck: (id: string) => void }) {
  const tone =
    alarm.severity === "critical"
      ? "border-red-200 bg-red-50"
      : "border-amber-200 bg-amber-50";

  return (
    <div className={`flex flex-col gap-1 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between ${tone}`}>
      <div>
        <p className="font-semibold capitalize text-slate-800">
          {alarm.severity === "critical" ? "CRITICAL" : "WARNING"} — {alarm.metric.replace("_", " ")}
        </p>
        <p className="text-slate-600">{alarm.message}</p>
        <p className="text-xs text-slate-400">{new Date(alarm.firstSeenAt).toLocaleString()}</p>
      </div>
      <div className="flex items-center gap-2">
        {alarm.acknowledgedAt ? (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
            ACK by {alarm.acknowledgedBy}
          </span>
        ) : alarm.state === "active" ? (
          <button
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => onAck(alarm.id)}
            type="button"
          >
            Acknowledge
          </button>
        ) : null}
        {alarm.state === "cleared" && (
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">Cleared</span>
        )}
      </div>
    </div>
  );
}

export default function UpsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [upsId, setUpsId] = useState<string>("");
  const [detail, setDetail] = useState<UpsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    params.then((p) => setUpsId(p.id));
  }, [params]);

  useEffect(() => {
    if (!upsId) return;
    let cancelled = false;

    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/ups/${upsId}`, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          const j = (await res.json()) as { error?: string };
          if (!cancelled) setError(j.error ?? "Failed to load.");
          return;
        }
        const data = (await res.json()) as UpsDetail;
        if (cancelled) return;
        setDetail(data);
        setNotesDraft(data.unit.notes ?? "");
      } catch {
        if (!cancelled) setError("Could not reach server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDetail();
    const t = window.setInterval(fetchDetail, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [upsId, refreshTick]);

  async function ackAlarm(alarmId: string) {
    await fetch(`/api/alarms/${alarmId}/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acknowledgedBy: "operator" }),
    });
    setRefreshTick((t) => t + 1);
  }

  async function saveNotes() {
    if (!detail) return;
    setNotesSaving(true);
    await fetch(`/api/ups/${detail.unit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notesDraft }),
    });
    setNotesSaving(false);
    setRefreshTick((t) => t + 1);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef3f8]">
        <p className="text-slate-500">Loading…</p>
      </main>
    );
  }

  if (error || !detail) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#eef3f8]">
        <p className="text-red-600">{error || "UPS not found."}</p>
        <Link href="/" className="text-sm font-semibold text-slate-700 underline">
          Back to dashboard
        </Link>
      </main>
    );
  }

  const { unit, device, telemetry, commissioning, activeAlarms, alarmHistory } = detail;
  const online = device?.online ?? false;
  const loadPct = telemetry?.loadPct;

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <ArrowLeft size={18} />
              </Link>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-950 text-white">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">{unit.upsId}</h1>
                <p className="text-sm text-slate-500">
                  {[unit.floor, unit.location].filter(Boolean).join(" / ") || "No location set"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
                  online ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                }`}
              >
                {online ? <Wifi size={15} /> : <WifiOff size={15} />}
                {online ? "Online" : "Offline"}
              </span>
              {activeAlarms.length > 0 && (
                <span className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  <AlertTriangle size={15} />
                  {activeAlarms.length} active alarm{activeAlarms.length !== 1 ? "s" : ""}
                </span>
              )}
              <button
                className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setRefreshTick((t) => t + 1)}
                type="button"
              >
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Input Voltage" value={fmt(telemetry?.voltIn)} unit="V" warn={(telemetry?.voltIn ?? 230) < 200} danger={(telemetry?.voltIn ?? 230) < 180} />
          <MetricCard label="Output Voltage" value={fmt(telemetry?.voltOut)} unit="V" warn={(telemetry?.voltOut ?? 230) < 210} danger={(telemetry?.voltOut ?? 230) < 200} />
          <MetricCard label="Battery DC" value={fmt(telemetry?.voltDc)} unit="V" warn={(telemetry?.voltDc ?? 50) < (unit.batteryNominalV * 0.917)} danger={(telemetry?.voltDc ?? 50) < (unit.batteryNominalV * 0.875)} />
          <MetricCard
            label="Load"
            value={loadPct !== null && loadPct !== undefined ? fmt(loadPct) : "--"}
            unit="%"
            warn={(loadPct ?? 0) > 80}
            danger={(loadPct ?? 0) > 95}
          />
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Input Current" value={fmt(telemetry?.ctIn)} unit="A" />
          <MetricCard label="Output Current" value={fmt(telemetry?.ctOut)} unit="A" />
          <MetricCard label="Input Apparent Power" value={fmt(telemetry?.sInVa, 0)} unit="VA" />
          <MetricCard label="Output Apparent Power" value={fmt(telemetry?.sOutVa, 0)} unit="VA" />
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Active Power Input" value="—" unit="W (not supported)" />
          <MetricCard label="Active Power Output" value="—" unit="W (not supported)" />
          <MetricCard label="Power Factor" value="—" unit="(not supported)" />
          <MetricCard label="Energy" value="—" unit="kWh (not supported)" />
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Cpu size={18} className="text-slate-500" />
              <h2 className="text-lg font-semibold">Device info</h2>
            </div>
            <dl className="grid gap-2 text-sm">
              {[
                ["UPS ID", unit.upsId],
                ["Device ID", device?.deviceId ?? "--"],
                ["IP Address", device?.ip ?? "--"],
                ["MAC Address", device?.mac ?? "--"],
                ["Firmware", device?.firmware ?? "--"],
                ["Serial", unit.serial || "--"],
                ["Capacity", unit.capacityVa ? `${unit.capacityVa.toLocaleString()} VA` : "--"],
                ["Battery nominal", unit.batteryNominalV ? `${unit.batteryNominalV} V` : "--"],
                ["RSSI", telemetry?.rssi !== null && telemetry?.rssi !== undefined ? `${telemetry.rssi} dBm` : "--"],
                ["Last seen", device?.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "--"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-500">{label}</span>
                  <span className={`font-semibold ${label === "RSSI" && telemetry?.rssi !== null && (telemetry?.rssi ?? 0) < -75 ? "text-amber-600" : ""}`}>
                    {value}
                  </span>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <BatteryCharging size={18} className="text-slate-500" />
              <h2 className="text-lg font-semibold">Maintenance notes</h2>
            </div>
            <textarea
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              rows={6}
              placeholder="Record maintenance history, calibration notes, or site observations…"
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
            />
            <button
              className="mt-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={saveNotes}
              disabled={notesSaving}
              type="button"
            >
              {notesSaving ? "Saving…" : "Save notes"}
            </button>
          </section>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Radio size={18} className="text-slate-500" />
              <h2 className="text-lg font-semibold">Commissioning status</h2>
            </div>
            {!commissioning ? (
              <p className="text-sm text-slate-400">No telemetry received yet.</p>
            ) : (
              <dl className="grid gap-2 text-sm">
                {([
                  ["WiFi mode", commissioning.wifiMode ?? "—"],
                  ["Config mode", commissioning.configMode === true ? "ACTIVE" : commissioning.configMode === false ? "No" : "—", commissioning.configMode === true],
                  ["Setup AP enabled", commissioning.setupApEnabled === true ? "YES" : commissioning.setupApEnabled === false ? "No" : "—", commissioning.setupApEnabled === true],
                  ["MQTT connected", commissioning.mqttConnected === true ? "Yes" : commissioning.mqttConnected === false ? "No" : "—"],
                  ["Seq", commissioning.seq !== null ? String(commissioning.seq) : "—"],
                  ["Free heap", commissioning.freeHeap !== null ? `${(commissioning.freeHeap / 1024).toFixed(0)} KB` : "—"],
                  ["Reset reason", commissioning.resetReason ?? "—"],
                ] as [string, string, boolean?][]).map(([label, value, highlight]) => (
                  <div key={label} className="flex justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-slate-500">{label}</span>
                    <span className={`font-semibold ${highlight ? "text-amber-600" : ""}`}>{value}</span>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <MapPin size={18} className="text-slate-500" />
              <h2 className="text-lg font-semibold">Physical location</h2>
            </div>
            {!commissioning ? (
              <p className="text-sm text-slate-400">No telemetry received yet.</p>
            ) : (
              <dl className="grid gap-2 text-sm">
                {([
                  ["Building", commissioning.building ?? "—"],
                  ["Floor", commissioning.floor ?? "—"],
                  ["Section", commissioning.section ?? "—"],
                  ["Work area", commissioning.workArea ?? "—"],
                  ["Location", commissioning.location ?? "—"],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold">{value}</span>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </div>

        {activeAlarms.length > 0 && (
          <section className="rounded-lg border border-red-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-600" />
              <h2 className="text-lg font-semibold text-red-800">Active alarms</h2>
            </div>
            <div className="grid gap-2">
              {activeAlarms.map((alarm) => (
                <AlarmRow key={alarm.id} alarm={alarm} onAck={ackAlarm} />
              ))}
            </div>
          </section>
        )}

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Gauge size={18} className="text-slate-500" />
            <h2 className="text-lg font-semibold">Alarm history</h2>
          </div>
          {alarmHistory.length === 0 ? (
            <p className="text-sm text-slate-500">No alarm history recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="py-2 pr-3">Metric</th>
                    <th className="py-2 pr-3">Severity</th>
                    <th className="py-2 pr-3">State</th>
                    <th className="py-2 pr-3">Message</th>
                    <th className="py-2 pr-3">First seen</th>
                    <th className="py-2 pr-3">Cleared</th>
                  </tr>
                </thead>
                <tbody>
                  {alarmHistory.slice(0, 50).map((alarm) => (
                    <tr key={alarm.id} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-semibold">{alarm.metric}</td>
                      <td className="py-2 pr-3 capitalize">{alarm.severity}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            alarm.state === "active" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {alarm.state}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{alarm.message}</td>
                      <td className="py-2 pr-3 text-slate-400">{new Date(alarm.firstSeenAt).toLocaleString()}</td>
                      <td className="py-2 pr-3 text-slate-400">
                        {alarm.clearedAt ? new Date(alarm.clearedAt).toLocaleString() : "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
