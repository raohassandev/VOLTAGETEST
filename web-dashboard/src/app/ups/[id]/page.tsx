"use client";

import {
  AlertTriangle,
  BatteryCharging,
  Cpu,
  ExternalLink,
  Info,
  MapPin,
  Radio,
  RefreshCw,
  TrendingUp,
  Wifi,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { checkUnauthorized } from "@/lib/handle-unauthorized";

// ── Types ─────────────────────────────────────────────────────────────────────

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
    id: string;
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
    pInW: number | null;
    pOutW: number | null;
    pfIn: number | null;
    pfOut: number | null;
    eInKwh: number | null;
    eOutKwh: number | null;
    freqIn: number | null;
    freqOut: number | null;
    qInVar: number | null;
    qOutVar: number | null;
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

interface HistoryPoint {
  volt_in: number;
  volt_out: number;
  volt_dc: number;
  s_out_va: number;
  received_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  return v.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  unit,
  warn,
  danger,
  note,
}: {
  label: string;
  value: string;
  unit: string;
  warn?: boolean;
  danger?: boolean;
  note?: string;
}) {
  const borderColor = danger
    ? "border-red-800"
    : warn
    ? "border-amber-800"
    : "border-slate-700";

  return (
    <div
      className={`rounded-lg border p-4 ${borderColor}`}
      style={{ background: "var(--surface-1)" }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${danger ? "text-red-400" : warn ? "text-amber-400" : "text-slate-100"}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-slate-500">{unit}</span>}
      </p>
      {note && <p className="mt-1 text-xs text-slate-500 italic">{note}</p>}
    </div>
  );
}

// ── Trend chart (SVG) ─────────────────────────────────────────────────────────

function TrendChart({ deviceId }: { deviceId: string }) {
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/telemetry/history?deviceId=${encodeURIComponent(deviceId)}&limit=120`,
          { cache: "no-store" },
        );
        if (checkUnauthorized(res)) return;
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { source: string; history: HistoryPoint[] };
        if (!cancelled) setPoints(data.history ?? []);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const t = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, [deviceId]);

  if (loading) return <div className="h-48 rounded iot-shimmer" />;

  if (points.length < 2) {
    return (
      <div
        className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 text-slate-500"
        style={{ background: "var(--surface-2)" }}
      >
        <TrendingUp size={28} />
        <p className="text-sm font-semibold">No history data yet.</p>
        <p className="text-xs">Data will appear after the first few MQTT messages.</p>
      </div>
    );
  }

  const W = 600, H = 160, PAD = 8;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  const voltInSeries  = points.map((p) => p.volt_in ?? 0);
  const voltOutSeries = points.map((p) => p.volt_out ?? 0);
  const voltDcSeries  = points.map((p) => p.volt_dc ?? 0);

  const allVolts = [...voltInSeries, ...voltOutSeries, ...voltDcSeries].filter(Number.isFinite);
  const minV = Math.min(...allVolts) * 0.95;
  const maxV = Math.max(...allVolts) * 1.05 || 1;

  function toX(i: number) { return PAD + (i / (points.length - 1)) * innerW; }
  function toY(v: number)  { return PAD + (1 - (v - minV) / (maxV - minV)) * innerH; }
  function polyline(series: number[]) {
    return series.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Voltage trend chart">
        <polyline points={polyline(voltInSeries)}  fill="none" stroke="#22d3ee" strokeWidth="1.5" />
        <polyline points={polyline(voltOutSeries)} fill="none" stroke="#34d399" strokeWidth="1.5" />
        <polyline points={polyline(voltDcSeries)}  fill="none" stroke="#fbbf24" strokeWidth="1.5" />
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded" style={{ background: "#22d3ee" }} />Input V</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded" style={{ background: "#34d399" }} />Output V</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded" style={{ background: "#fbbf24" }} />Battery V (cal.)</span>
        <span className="ml-auto text-slate-600">{points.length} samples</span>
      </div>
    </div>
  );
}

// ── Alarm row ─────────────────────────────────────────────────────────────────

function AlarmRow({ alarm, onAck }: { alarm: AlarmRecord; onAck: (id: string) => void }) {
  const isCrit = alarm.severity === "critical";
  return (
    <div className={`flex flex-col gap-1 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between ${isCrit ? "border-red-800 bg-red-900/20" : "border-amber-800 bg-amber-900/20"}`}>
      <div>
        <p className={`font-bold ${isCrit ? "text-red-400" : "text-amber-400"}`}>
          {isCrit ? "CRITICAL" : "WARNING"} — {alarm.metric.replace(/_/g, " ")}
        </p>
        <p className={`text-sm ${isCrit ? "text-red-300" : "text-amber-300"}`}>{alarm.message}</p>
        <p className="text-xs text-slate-500">{new Date(alarm.firstSeenAt).toLocaleString()}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {alarm.acknowledgedAt ? (
          <span className="rounded-full bg-slate-800 border border-slate-700 px-2 py-1 text-xs font-semibold text-slate-400">
            ACK&apos;d {alarm.acknowledgedBy}
          </span>
        ) : alarm.state === "active" ? (
          <button
            className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
            onClick={() => onAck(alarm.id)}
            type="button"
          >
            Acknowledge
          </button>
        ) : null}
        {alarm.state === "cleared" && (
          <span className="rounded-full bg-emerald-900/40 border border-emerald-800 px-2 py-1 text-xs font-semibold text-emerald-400">Cleared</span>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UpsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [upsId, setUpsId] = useState<string>("");
  const [detail, setDetail] = useState<UpsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    params.then((p) => setUpsId(decodeURIComponent(p.id)));
  }, [params]);

  useEffect(() => {
    if (!upsId) return;
    let cancelled = false;

    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/ups/${upsId}`, { cache: "no-store" });
        if (cancelled) return;
        if (checkUnauthorized(res)) return;
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
    return () => { cancelled = true; window.clearInterval(t); };
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
    if (!detail || !canSaveNotes) return;
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
      <AppShell>
        <div className="flex h-64 items-center justify-center text-slate-500">Loading…</div>
      </AppShell>
    );
  }

  if (error || !detail) {
    return (
      <AppShell>
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <p className="text-lg font-semibold text-red-400">{error || "UPS not found."}</p>
          <Link href="/" className="text-sm font-semibold text-cyan-400 underline">
            Back to dashboard
          </Link>
        </div>
      </AppShell>
    );
  }

  const { unit, device, telemetry, commissioning, activeAlarms, alarmHistory } = detail;
  const online = device?.online ?? false;
  const loadPct = telemetry?.loadPct;
  const voltDcCalibrated = telemetry ? telemetry.voltDc : null;
  const canSaveNotes = Boolean(device && unit.id !== device.id);

  // shared section style
  const sectionStyle = { background: "var(--surface-1)", borderColor: "var(--border-default)" };

  return (
    <AppShell>
      <div className="flex flex-col gap-5 iot-page">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-white">{unit.upsId}</h1>
              {online ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 border border-emerald-800 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
                  <Wifi size={11} /> Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-900/40 border border-red-800 px-2.5 py-0.5 text-xs font-bold text-red-400">
                  <WifiOff size={11} /> Offline
                </span>
              )}
              {activeAlarms.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-900/40 border border-red-800 px-2.5 py-0.5 text-xs font-bold text-red-400">
                  <AlertTriangle size={11} className="iot-blink" />
                  {activeAlarms.length} alarm{activeAlarms.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {[unit.floor, unit.location].filter(Boolean).join(" / ") || "No location set"} — Last seen:{" "}
              {device?.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "—"}
            </p>
          </div>
          <button
            className="flex items-center gap-2 self-start rounded-md border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
            onClick={() => setRefreshTick((t) => t + 1)}
            type="button"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {/* ── Active alarms banner ─────────────────────────────────────────── */}
        {activeAlarms.length > 0 && (
          <section className="rounded-lg border border-red-800 p-4" style={{ background: "var(--surface-1)", boxShadow: "0 0 16px rgba(239,68,68,0.1)" }}>
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-400 iot-blink" />
              <h2 className="font-bold text-red-400">Active alarms ({activeAlarms.length})</h2>
            </div>
            <div className="flex flex-col gap-2">
              {activeAlarms.map((alarm) => (
                <AlarmRow key={alarm.id} alarm={alarm} onAck={ackAlarm} />
              ))}
            </div>
          </section>
        )}

        {/* ── Primary measurements ─────────────────────────────────────────── */}
        <div>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Live measurements</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Input Voltage"  value={fmt(telemetry?.voltIn)}  unit="V" warn={(telemetry?.voltIn ?? 230) < 200}  danger={(telemetry?.voltIn ?? 230) < 180} />
            <MetricCard label="Output Voltage" value={fmt(telemetry?.voltOut)} unit="V" warn={(telemetry?.voltOut ?? 230) < 210} danger={(telemetry?.voltOut ?? 230) < 200} />
            <MetricCard
              label="Battery Voltage"
              value={fmt(voltDcCalibrated)}
              unit="V"
              warn={voltDcCalibrated !== null && voltDcCalibrated < unit.batteryNominalV * 0.917}
              danger={voltDcCalibrated !== null && voltDcCalibrated < unit.batteryNominalV * 0.875}
              note={`nominal ${unit.batteryNominalV}V`}
            />
            <MetricCard label="Load" value={loadPct !== null && loadPct !== undefined ? fmt(loadPct) : "--"} unit="%" warn={(loadPct ?? 0) > 80} danger={(loadPct ?? 0) > 95} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Input Current"         value={fmt(telemetry?.ctIn)}      unit="A"  />
          <MetricCard label="Output Current"        value={fmt(telemetry?.ctOut)}     unit="A"  />
          <MetricCard label="Input Apparent Power"  value={fmt(telemetry?.sInVa, 0)}  unit="VA" />
          <MetricCard label="Output Apparent Power" value={fmt(telemetry?.sOutVa, 0)} unit="VA" />
        </div>

        {/* ── Energy analyzer fields ───────────────────────────────────────── */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Power &amp; energy (energy analyzer firmware)</h2>
            <div className="flex gap-1 items-center text-xs text-slate-600">
              <Info size={11} />
              <span>Fields show &ldquo;Not available — firmware calibration required&rdquo; when the waveform firmware is not installed or calibrated.</span>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Input Active Power"
              value={telemetry?.pInW != null ? fmt(telemetry.pInW, 1) : "Not available"}
              unit={telemetry?.pInW != null ? "W" : ""}
              note={telemetry?.pInW == null ? "firmware calibration required" : undefined}
            />
            <MetricCard
              label="Output Active Power"
              value={telemetry?.pOutW != null ? fmt(telemetry.pOutW, 1) : "Not available"}
              unit={telemetry?.pOutW != null ? "W" : ""}
              note={telemetry?.pOutW == null ? "firmware calibration required" : undefined}
            />
            <MetricCard
              label="Input Power Factor"
              value={telemetry?.pfIn != null ? fmt(telemetry.pfIn, 3) : "Not available"}
              unit=""
              note={telemetry?.pfIn == null ? "firmware calibration required" : undefined}
            />
            <MetricCard
              label="Output Power Factor"
              value={telemetry?.pfOut != null ? fmt(telemetry.pfOut, 3) : "Not available"}
              unit=""
              note={telemetry?.pfOut == null ? "firmware calibration required" : undefined}
            />
            <MetricCard
              label="Input Frequency"
              value={telemetry?.freqIn != null ? fmt(telemetry.freqIn, 1) : "Not available"}
              unit={telemetry?.freqIn != null ? "Hz" : ""}
              note={telemetry?.freqIn == null ? "firmware calibration required" : undefined}
            />
            <MetricCard
              label="Output Frequency"
              value={telemetry?.freqOut != null ? fmt(telemetry.freqOut, 1) : "Not available"}
              unit={telemetry?.freqOut != null ? "Hz" : ""}
              note={telemetry?.freqOut == null ? "firmware calibration required" : undefined}
            />
            <MetricCard
              label="Input Reactive Power"
              value={telemetry?.qInVar != null ? fmt(telemetry.qInVar, 1) : "Not available"}
              unit={telemetry?.qInVar != null ? "VAR" : ""}
              note={telemetry?.qInVar == null ? "firmware calibration required" : undefined}
            />
            <MetricCard
              label="Output Reactive Power"
              value={telemetry?.qOutVar != null ? fmt(telemetry.qOutVar, 1) : "Not available"}
              unit={telemetry?.qOutVar != null ? "VAR" : ""}
              note={telemetry?.qOutVar == null ? "firmware calibration required" : undefined}
            />
            <MetricCard
              label="Input Energy"
              value={telemetry?.eInKwh != null ? fmt(telemetry.eInKwh, 3) : "Not available"}
              unit={telemetry?.eInKwh != null ? "kWh" : ""}
              note={telemetry?.eInKwh == null ? "firmware calibration required" : undefined}
            />
            <MetricCard
              label="Output Energy"
              value={telemetry?.eOutKwh != null ? fmt(telemetry.eOutKwh, 3) : "Not available"}
              unit={telemetry?.eOutKwh != null ? "kWh" : ""}
              note={telemetry?.eOutKwh == null ? "firmware calibration required" : undefined}
            />
          </div>
          <div className="mt-3 flex gap-2 rounded-lg border border-slate-700 p-3" style={{ background: "var(--surface-2)" }}>
            <Info size={13} className="mt-0.5 shrink-0 text-slate-500" />
            <p className="text-xs text-slate-500">
              Energy analyzer firmware supports real power (W), power factor, energy (kWh), reactive power (VAR), and line frequency when the waveform-sampling firmware is installed and calibrated. Accuracy depends on voltage/current sensor calibration. Phase correction is computed but not yet applied in firmware v1.x — reactive power (VAR) is unsigned.
            </p>
          </div>
        </div>

        {/* ── Board access + device info ───────────────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-lg border p-5" style={sectionStyle}>
            <div className="mb-4 flex items-center gap-2">
              <Cpu size={16} className="text-slate-500" />
              <h2 className="font-bold text-white">Board access</h2>
            </div>
            <dl className="grid gap-2 text-sm">
              {[
                ["Device ID", device?.deviceId ?? "--"],
                ["MAC", device?.mac ?? "--"],
                ["Firmware", device?.firmware ?? "--"],
                ["RSSI", telemetry?.rssi != null ? `${telemetry.rssi} dBm` : "--"],
                ["WiFi mode", commissioning?.wifiMode ?? "--"],
                ["MQTT connected", commissioning?.mqttConnected === true ? "Yes" : commissioning?.mqttConnected === false ? "No" : "--"],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between border-b border-slate-800 pb-1.5">
                  <span className="text-slate-500">{label}</span>
                  <span className={`font-semibold text-slate-200 ${label === "RSSI" && telemetry?.rssi != null && telemetry.rssi < -75 ? "text-amber-400" : ""}`}>
                    {value}
                  </span>
                </div>
              ))}
              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                <span className="text-slate-500">IP Address</span>
                {device?.ip ? (
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-mono font-semibold text-slate-200">{device.ip}</span>
                    <div className="flex gap-1.5 text-xs">
                      <a href={`http://${device.ip}/`} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded bg-cyan-900/50 border border-cyan-800 px-2 py-0.5 font-semibold text-cyan-300 hover:bg-cyan-800/50">
                        <ExternalLink size={10} /> Open portal
                      </a>
                      <a href={`http://${device.ip}/config`} target="_blank" rel="noreferrer"
                        className="rounded bg-slate-700 px-2 py-0.5 font-semibold text-slate-300 hover:bg-slate-600">Config</a>
                      <a href={`http://${device.ip}/data`} target="_blank" rel="noreferrer"
                        className="rounded bg-slate-700 px-2 py-0.5 font-semibold text-slate-300 hover:bg-slate-600">Live JSON</a>
                      <a href={`http://${device.ip}/update`} target="_blank" rel="noreferrer"
                        className="rounded bg-slate-700 px-2 py-0.5 font-semibold text-slate-300 hover:bg-slate-600">OTA</a>
                    </div>
                  </div>
                ) : (
                  <span className="font-semibold text-slate-500">—</span>
                )}
              </div>
            </dl>
          </section>

          <section className="rounded-lg border p-5" style={sectionStyle}>
            <div className="mb-4 flex items-center gap-2">
              <Cpu size={16} className="text-slate-500" />
              <h2 className="font-bold text-white">UPS spec</h2>
            </div>
            <dl className="grid gap-2 text-sm">
              {[
                ["UPS ID", unit.upsId],
                ["Name", unit.name || "--"],
                ["Serial", unit.serial || "--"],
                ["Capacity", unit.capacityVa ? `${unit.capacityVa.toLocaleString()} VA` : "--"],
                ["Battery nominal", unit.batteryNominalV ? `${unit.batteryNominalV} V` : "--"],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between border-b border-slate-800 pb-1.5">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-slate-200">{value}</span>
                </div>
              ))}
            </dl>
          </section>
        </div>

        {/* ── Trend chart ──────────────────────────────────────────────────── */}
        {device && (
          <section className="rounded-lg border p-5" style={sectionStyle}>
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-cyan-500" />
              <h2 className="font-bold text-white">Voltage trend (last 2 hours)</h2>
            </div>
            <TrendChart deviceId={device.deviceId} />
          </section>
        )}

        {/* ── Commissioning + location ─────────────────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-lg border p-5" style={sectionStyle}>
            <div className="mb-4 flex items-center gap-2">
              <Radio size={16} className="text-slate-500" />
              <h2 className="font-bold text-white">Commissioning status</h2>
            </div>
            {!commissioning ? (
              <p className="text-sm text-slate-500">No telemetry received yet.</p>
            ) : (
              <dl className="grid gap-2 text-sm">
                {([
                  ["Config mode", commissioning.configMode === true ? "ACTIVE" : commissioning.configMode === false ? "No" : "—", commissioning.configMode === true],
                  ["Setup AP enabled", commissioning.setupApEnabled === true ? "YES" : commissioning.setupApEnabled === false ? "No" : "—", commissioning.setupApEnabled === true],
                  ["Seq", commissioning.seq !== null ? String(commissioning.seq) : "—"],
                  ["Free heap", commissioning.freeHeap !== null ? `${(commissioning.freeHeap / 1024).toFixed(0)} KB` : "—"],
                  ["Reset reason", commissioning.resetReason ?? "—"],
                ] as [string, string, boolean?][]).map(([label, value, highlight]) => (
                  <div key={label} className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-500">{label}</span>
                    <span className={`font-semibold ${highlight ? "text-amber-400" : "text-slate-200"}`}>{value}</span>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section className="rounded-lg border p-5" style={sectionStyle}>
            <div className="mb-4 flex items-center gap-2">
              <MapPin size={16} className="text-slate-500" />
              <h2 className="font-bold text-white">Physical location</h2>
            </div>
            {!commissioning ? (
              <p className="text-sm text-slate-500">No telemetry received yet.</p>
            ) : (
              <dl className="grid gap-2 text-sm">
                {([
                  ["Building", commissioning.building ?? "—"],
                  ["Floor", commissioning.floor ?? "—"],
                  ["Section", commissioning.section ?? "—"],
                  ["Work area", commissioning.workArea ?? "—"],
                  ["Location", commissioning.location ?? "—"],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="flex justify-between border-b border-slate-800 pb-1.5">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold text-slate-200">{value}</span>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </div>

        {/* ── Maintenance notes ─────────────────────────────────────────────── */}
        <section className="rounded-lg border p-5" style={sectionStyle}>
          <div className="mb-4 flex items-center gap-2">
            <BatteryCharging size={16} className="text-slate-500" />
            <h2 className="font-bold text-white">Maintenance notes</h2>
          </div>
          <textarea
            className="w-full rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-600 transition-colors"
            style={{ background: "var(--surface-2)" }}
            rows={5}
            placeholder="Record maintenance history, calibration notes, or site observations…"
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
          />
          <button
            className="mt-2 rounded-md bg-cyan-700 hover:bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
            onClick={saveNotes}
            disabled={notesSaving || !canSaveNotes}
            title={canSaveNotes ? undefined : "Assign this board to a UPS inventory record before saving notes."}
            type="button"
          >
            {notesSaving ? "Saving…" : canSaveNotes ? "Save notes" : "Assign UPS to enable notes"}
          </button>
        </section>

        {/* ── Alarm history ─────────────────────────────────────────────────── */}
        <section className="rounded-lg border p-5" style={sectionStyle}>
          <h2 className="mb-4 font-bold text-white">Alarm history</h2>
          {alarmHistory.length === 0 ? (
            <p className="text-sm text-slate-500">No alarm history recorded for this UPS.</p>
          ) : (
            <>
              {/* Mobile list */}
              <div className="divide-y divide-slate-800 -mx-5 sm:hidden">
                {alarmHistory.slice(0, 50).map((alarm) => (
                  <div key={alarm.id} className="px-5 py-3 flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-slate-300">{alarm.metric}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${alarm.severity === "critical" ? "bg-red-900/50 text-red-400" : "bg-amber-900/50 text-amber-400"}`}>{alarm.severity.toUpperCase()}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${alarm.state === "active" ? "bg-red-900/40 text-red-400" : "bg-emerald-900/40 text-emerald-400"}`}>{alarm.state}</span>
                    </div>
                    <p className="text-xs text-slate-400">{alarm.message}</p>
                    <p className="text-[10px] text-slate-600">{new Date(alarm.firstSeenAt).toLocaleString()}{alarm.clearedAt ? ` → ${new Date(alarm.clearedAt).toLocaleString()}` : ""}</p>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3">Metric</th>
                      <th className="py-2 pr-3">Severity</th>
                      <th className="py-2 pr-3">State</th>
                      <th className="py-2 pr-3">Message</th>
                      <th className="py-2 pr-3">First seen</th>
                      <th className="py-2">Cleared</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alarmHistory.slice(0, 50).map((alarm) => (
                      <tr key={alarm.id} className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 pr-3 font-mono text-xs font-semibold text-slate-300">{alarm.metric}</td>
                        <td className="py-2 pr-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${alarm.severity === "critical" ? "bg-red-900/50 text-red-400" : "bg-amber-900/50 text-amber-400"}`}>{alarm.severity.toUpperCase()}</span>
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${alarm.state === "active" ? "bg-red-900/40 text-red-400" : "bg-emerald-900/40 text-emerald-400"}`}>{alarm.state}</span>
                        </td>
                        <td className="py-2 pr-3 text-slate-400">{alarm.message}</td>
                        <td className="py-2 pr-3 text-xs text-slate-500 whitespace-nowrap">{new Date(alarm.firstSeenAt).toLocaleString()}</td>
                        <td className="py-2 text-xs text-slate-500 whitespace-nowrap">{alarm.clearedAt ? new Date(alarm.clearedAt).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
