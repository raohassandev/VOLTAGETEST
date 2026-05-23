"use client";

import {
  AlertTriangle,
  ArrowRight,
  Cpu,
  ExternalLink,
  Gauge,
  LayoutGrid,
  List,
  Server,
  Wifi,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  FleetDevice,
  ServerAlarm,
  formatNumber,
  useTelemetry,
} from "@/lib/telemetry";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAgo(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function alarmTone(alarms: ServerAlarm[]) {
  if (alarms.some((a) => a.severity === "critical")) return "critical";
  if (alarms.length > 0) return "warning";
  return "normal";
}

// ── Summary stats row ─────────────────────────────────────────────────────────

function SummaryRow({
  devices,
  nowMs,
  serverAlarms,
  offlineThresholdMs,
}: {
  devices: FleetDevice[];
  nowMs: number;
  serverAlarms: ServerAlarm[];
  offlineThresholdMs: number;
}) {
  const onlineDevices = devices.filter((d) => nowMs - d.lastSeenMs < offlineThresholdMs);
  const online   = onlineDevices.length;
  const offline  = devices.length - online;
  const critCount = serverAlarms.filter((a) => a.severity === "critical").length;
  const totalPOutW = onlineDevices.reduce((s, d) => {
    const p = d.telemetry.p_out_w;
    return s + (p != null ? Number(p) : 0);
  }, 0);
  const hasPOutW = onlineDevices.some((d) => d.telemetry.p_out_w != null);
  const totalEOutKwh = onlineDevices.reduce((s, d) => {
    const e = d.telemetry.e_out_kwh;
    return s + (e != null ? Number(e) : 0);
  }, 0);
  const hasEOutKwh = onlineDevices.some((d) => d.telemetry.e_out_kwh != null);

  const stats = [
    {
      label: "Total UPS",
      value: devices.length,
      icon: Cpu,
      valueColor: "text-slate-100",
      iconColor: "text-slate-400",
      iconBg: "bg-slate-800",
      border: "border-slate-700",
      href: null,
    },
    {
      label: "Online",
      value: online,
      icon: Wifi,
      valueColor: online ? "text-emerald-400" : "text-slate-500",
      iconColor: online ? "text-emerald-400" : "text-slate-600",
      iconBg: online ? "bg-emerald-900/50" : "bg-slate-800",
      border: online ? "border-emerald-800" : "border-slate-700",
      href: null,
    },
    {
      label: "Offline",
      value: offline,
      icon: WifiOff,
      valueColor: offline ? "text-red-400" : "text-slate-500",
      iconColor: offline ? "text-red-400" : "text-slate-600",
      iconBg: offline ? "bg-red-900/40" : "bg-slate-800",
      border: offline ? "border-red-800" : "border-slate-700",
      href: null,
    },
    {
      label: "Critical",
      value: critCount,
      icon: AlertTriangle,
      valueColor: critCount ? "text-red-400" : "text-slate-500",
      iconColor: critCount ? "text-red-400" : "text-slate-600",
      iconBg: critCount ? "bg-red-900/40" : "bg-slate-800",
      border: critCount ? "border-red-800" : "border-slate-700",
      href: "/alarms",
    },
    {
      label: "Live Out W",
      value: hasPOutW ? formatNumber(totalPOutW) : "–",
      icon: Gauge,
      valueColor: "text-cyan-300",
      iconColor: "text-cyan-400",
      iconBg: "bg-cyan-900/40",
      border: "border-cyan-800",
      href: null,
    },
    {
      label: "Energy kWh",
      value: hasEOutKwh ? formatNumber(totalEOutKwh) : "–",
      icon: Gauge,
      valueColor: "text-violet-300",
      iconColor: "text-violet-400",
      iconBg: "bg-violet-900/40",
      border: "border-violet-800",
      href: null,
    },
  ];

  return (
    // 3 cols on mobile → 3 on sm → 6 on lg
    <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">
      {stats.map((s) => {
        const Icon = s.icon;
        const inner = (
          <>
            <div className={`mb-1.5 sm:mb-2 inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg ${s.iconBg} border ${s.border}`}>
              <Icon size={14} className={s.iconColor} />
            </div>
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide leading-tight" style={{ color: "var(--text-muted)" }}>
              {s.label}
            </p>
            <p className={`mt-0.5 text-lg sm:text-xl font-bold leading-tight ${s.valueColor}`}>{s.value}</p>
          </>
        );
        const cls = `rounded-xl border p-3 sm:p-4 ${s.border}`;
        const style = { background: "var(--surface-1)" };
        return s.href ? (
          <Link key={s.label} href={s.href} className={`iot-card ${cls}`} style={style}>{inner}</Link>
        ) : (
          <div key={s.label} className={cls} style={style}>{inner}</div>
        );
      })}
    </div>
  );
}

// ── UPS Card ──────────────────────────────────────────────────────────────────

function UpsCard({
  device,
  nowMs,
  deviceAlarms,
  offlineThresholdMs,
}: {
  device: FleetDevice;
  nowMs: number;
  deviceAlarms: ServerAlarm[];
  offlineThresholdMs: number;
}) {
  const online   = nowMs - device.lastSeenMs < offlineThresholdMs;
  const tone     = alarmTone(deviceAlarms);
  const upsId    = device.inventory?.upsId || device.telemetry.ups_id || device.id;
  const location = [device.inventory?.floor, device.inventory?.location].filter(Boolean).join(" / ") || null;
  const boardIp  = device.telemetry.ip || null;

  const capacityVa = device.inventory?.capacityVa ?? 0;
  const loadPct    = capacityVa > 0
    ? (Number(device.telemetry.s_out_va ?? 0) / capacityVa) * 100
    : null;
  const voltDcDisplay = device.telemetry.volt_dc != null
    ? formatNumber(Number(device.telemetry.volt_dc ?? 0))
    : "--";

  const borderClass =
    !online         ? "border-slate-700" :
    tone === "critical" ? "border-red-700"   :
    tone === "warning"  ? "border-amber-700" :
    "border-slate-700";

  const glowStyle =
    !online             ? {} :
    tone === "critical" ? { boxShadow: "0 0 0 1px rgba(239,68,68,0.3), 0 4px 20px rgba(239,68,68,0.12)" } :
    tone === "warning"  ? { boxShadow: "0 0 0 1px rgba(245,158,11,0.3), 0 4px 20px rgba(245,158,11,0.1)"  } :
    { boxShadow: "0 0 0 1px rgba(6,182,212,0.1), 0 2px 12px rgba(0,0,0,0.3)" };

  const headerBg =
    !online             ? "bg-slate-800/40"  :
    tone === "critical" ? "bg-red-900/20"    :
    tone === "warning"  ? "bg-amber-900/15"  :
    "bg-slate-800/30";

  return (
    <div
      className={`iot-card flex flex-col rounded-xl border overflow-hidden ${borderClass} ${!online ? "opacity-70" : ""}`}
      style={{ background: "var(--surface-1)", ...glowStyle }}
    >
      {/* Card header */}
      <div className={`flex items-start justify-between gap-2 px-3 pt-3 pb-2.5 sm:px-4 sm:pt-4 sm:pb-3 ${headerBg}`}>
        <div className="min-w-0">
          <p className="truncate font-bold text-slate-100 leading-tight tracking-tight text-sm sm:text-base">{upsId}</p>
          {location && (
            <p className="mt-0.5 truncate text-xs" style={{ color: "var(--text-muted)" }}>{location}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {online ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-700 bg-emerald-900/40 px-1.5 sm:px-2 py-0.5 text-xs font-bold text-emerald-400">
              <span className="status-dot online iot-pulse" style={{ width: "5px", height: "5px" }} />
              <span className="hidden xs:inline">Online</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-800 px-1.5 sm:px-2 py-0.5 text-xs font-bold text-slate-400">
              <WifiOff size={9} />
              <span className="hidden xs:inline">Offline</span>
            </span>
          )}
          {tone === "critical" && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-red-700 bg-red-900/40 px-1.5 sm:px-2 py-0.5 text-xs font-bold text-red-400">
              <AlertTriangle size={9} className="iot-blink" /> CRIT
            </span>
          )}
          {tone === "warning" && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-700 bg-amber-900/30 px-1.5 sm:px-2 py-0.5 text-xs font-bold text-amber-400">
              <AlertTriangle size={9} /> WARN
            </span>
          )}
        </div>
      </div>

      {/* Primary metrics */}
      <div
        className={`grid grid-cols-3 text-center border-t ${!online ? "opacity-40" : ""}`}
        style={{ borderColor: "var(--border-subtle)" }}
      >
        {[
          { label: "Out V",  value: formatNumber(Number(device.telemetry.volt_out ?? 0)) },
          { label: "Out A",  value: formatNumber(Number(device.telemetry.ct_out   ?? 0)) },
          { label: "Out W",  value: device.telemetry.p_out_w != null ? formatNumber(Number(device.telemetry.p_out_w)) : "–" },
          { label: "PF",     value: device.telemetry.pf_out  != null ? formatNumber(Number(device.telemetry.pf_out))  : "–" },
          { label: "Bat V",  value: voltDcDisplay },
          { label: "Out VA", value: formatNumber(Number(device.telemetry.s_out_va ?? 0)) },
        ].map(({ label, value }, i) => (
          <div
            key={label}
            className={`py-2 sm:py-2.5 ${i % 3 !== 0 ? "border-l" : ""} ${i >= 3 ? "border-t" : ""}`}
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</p>
            <p className="text-xs sm:text-sm font-bold text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      {/* Secondary metrics */}
      <div
        className={`grid grid-cols-4 text-center border-t ${!online ? "opacity-40" : ""}`}
        style={{ borderColor: "var(--border-subtle)" }}
      >
        {[
          { label: "In V",   value: formatNumber(Number(device.telemetry.volt_in  ?? 0)) },
          { label: "In A",   value: formatNumber(Number(device.telemetry.ct_in    ?? 0)) },
          { label: "In W",   value: device.telemetry.p_in_w   != null ? formatNumber(Number(device.telemetry.p_in_w))   : "–" },
          { label: "Hz In",  value: device.telemetry.freq_in  != null ? formatNumber(Number(device.telemetry.freq_in))  : "–" },
          { label: "kWh In", value: device.telemetry.e_in_kwh != null ? formatNumber(Number(device.telemetry.e_in_kwh)) : "–" },
          { label: "kWh Out",value: device.telemetry.e_out_kwh!= null ? formatNumber(Number(device.telemetry.e_out_kwh)): "–" },
          { label: "RSSI",   value: device.telemetry.rssi ? `${device.telemetry.rssi}` : "--" },
          { label: "Load",   value: loadPct !== null ? `${formatNumber(loadPct)}%` : "--" },
        ].map(({ label, value }, i) => (
          <div
            key={label}
            className={`py-1.5 sm:py-2 ${i % 4 !== 0 ? "border-l" : ""} ${i >= 4 ? "border-t" : ""}`}
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</p>
            <p className="text-xs font-semibold text-slate-300">{value}</p>
          </div>
        ))}
      </div>

      {/* Board IP */}
      <div className="border-t px-3 sm:px-4 py-2" style={{ borderColor: "var(--border-subtle)" }}>
        {boardIp ? (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-mono text-xs text-slate-400">{boardIp}</span>
            <div className="flex gap-1">
              {[
                { label: "Portal", href: `http://${boardIp}/` },
                { label: "Config", href: `http://${boardIp}/config` },
                { label: "OTA",    href: `http://${boardIp}/update` },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs font-semibold text-slate-400 hover:border-slate-600 hover:text-slate-200 transition-colors"
                >
                  {label === "Portal" && <ExternalLink size={9} className="inline mr-0.5" />}
                  {label}
                </a>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>No board IP</p>
        )}
      </div>

      {/* Footer */}
      <div
        className="mt-auto flex items-center justify-between gap-2 border-t px-3 sm:px-4 py-2.5"
        style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}
      >
        <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
          {online ? device.lastMessageAt : `${formatAgo(nowMs - device.lastSeenMs)}`}
        </span>
        <Link
          href={`/ups/${upsId}`}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-cyan-800 bg-cyan-900/30 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/50 transition-colors"
        >
          Details <ArrowRight size={11} />
        </Link>
      </div>
    </div>
  );
}

// ── Compact list view ─────────────────────────────────────────────────────────

function CompactTable({
  devices,
  nowMs,
  alarmsByDevice,
  offlineThresholdMs,
}: {
  devices: FleetDevice[];
  nowMs: number;
  alarmsByDevice: Map<string, ServerAlarm[]>;
  offlineThresholdMs: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr
            className="border-b text-left text-xs font-semibold uppercase tracking-wide"
            style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}
          >
            {["UPS", "Location", "In V", "Out V", "Bat V", "Out VA", "Load %", "RSSI", "Status", "Last seen"].map((h) => (
              <th key={h} className="py-2.5 pr-3 whitespace-nowrap first:pl-4">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {devices.length === 0 ? (
            <tr>
              <td className="py-6 pl-4 text-xs" style={{ color: "var(--text-muted)" }} colSpan={10}>
                No UPS devices found.
              </td>
            </tr>
          ) : (
            devices.map((device) => {
              const alarms    = alarmsByDevice.get(device.id) ?? [];
              const online    = nowMs - device.lastSeenMs < offlineThresholdMs;
              const tone      = alarmTone(alarms);
              const upsId     = device.inventory?.upsId || device.telemetry.ups_id || device.id;
              const capacityVa = device.inventory?.capacityVa ?? 0;
              const loadPct   = capacityVa > 0 ? (Number(device.telemetry.s_out_va ?? 0) / capacityVa) * 100 : null;
              const voltDcDisplay = device.telemetry.volt_dc != null ? formatNumber(Number(device.telemetry.volt_dc ?? 0)) : "--";

              return (
                <tr
                  key={device.id}
                  className={`border-b transition-colors hover:bg-slate-800/40 ${!online ? "opacity-50" : ""}`}
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <td className="py-2.5 pr-3 pl-4 font-semibold whitespace-nowrap">
                    <Link href={`/ups/${upsId}`} className="text-cyan-400 hover:text-cyan-300 hover:underline">{upsId}</Link>
                  </td>
                  <td className="py-2.5 pr-3 text-xs max-w-[120px] truncate" style={{ color: "var(--text-muted)" }}>
                    {[device.inventory?.floor, device.inventory?.location].filter(Boolean).join(" / ") || "--"}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-300">{formatNumber(Number(device.telemetry.volt_in  ?? 0))}</td>
                  <td className="py-2.5 pr-3 text-slate-300">{formatNumber(Number(device.telemetry.volt_out ?? 0))}</td>
                  <td className="py-2.5 pr-3 text-slate-300">{voltDcDisplay}</td>
                  <td className="py-2.5 pr-3 text-slate-300">{formatNumber(Number(device.telemetry.s_out_va ?? 0))}</td>
                  <td className="py-2.5 pr-3">
                    {loadPct !== null ? (
                      <span className={loadPct > 95 ? "font-bold text-red-400" : loadPct > 80 ? "font-semibold text-amber-400" : "text-slate-300"}>
                        {formatNumber(loadPct)}%
                      </span>
                    ) : <span className="text-slate-600">--</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-slate-400">
                    {device.telemetry.rssi ? `${device.telemetry.rssi}` : "--"}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold border whitespace-nowrap ${
                      !online             ? "bg-slate-800 border-slate-700 text-slate-500"         :
                      tone === "critical" ? "bg-red-900/40 border-red-700 text-red-400"            :
                      tone === "warning"  ? "bg-amber-900/30 border-amber-700 text-amber-400"      :
                      "bg-emerald-900/30 border-emerald-700 text-emerald-400"
                    }`}>
                      {!online ? "offline" : tone === "critical" ? "critical" : tone === "warning" ? "warning" : "online"}
                    </span>
                  </td>
                  <td className="py-2.5 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{device.lastMessageAt}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
type FilterTab = "all" | "online" | "offline" | "alarm";
type ViewMode  = "cards" | "list";

export default function Home() {
  const { fleetDevices, serverAlarms, offlineThresholdMs } = useTelemetry();
  const [nowMs, setNowMs]         = useState(() => Date.now());
  const [search, setSearch]       = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [viewMode, setViewMode]   = useState<ViewMode>("cards");
  const [page, setPage]           = useState(1);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 5_000);
    return () => window.clearInterval(t);
  }, []);

  const alarmsByDevice = new Map<string, ServerAlarm[]>();
  for (const a of serverAlarms) {
    const list = alarmsByDevice.get(a.deviceId) ?? [];
    list.push(a);
    alarmsByDevice.set(a.deviceId, list);
  }

  const filtered = fleetDevices.filter((d) => {
    const upsId  = d.inventory?.upsId || d.telemetry.ups_id || d.id;
    const online  = nowMs - d.lastSeenMs < offlineThresholdMs;
    const hasAlarm = (alarmsByDevice.get(d.id) ?? []).length > 0;
    if (filterTab === "online"  && !online)    return false;
    if (filterTab === "offline" &&  online)    return false;
    if (filterTab === "alarm"   && !hasAlarm)  return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      upsId.toLowerCase().includes(q) ||
      (d.telemetry.device_id ?? "").toLowerCase().includes(q) ||
      (d.inventory?.floor ?? "").toLowerCase().includes(q) ||
      (d.inventory?.location ?? "").toLowerCase().includes(q)
    );
  });

  const filterTabs: { key: FilterTab; label: string; short: string }[] = [
    { key: "all",     label: `All (${fleetDevices.length})`,          short: `All` },
    { key: "online",  label: `Online (${fleetDevices.filter((d) => nowMs - d.lastSeenMs < offlineThresholdMs).length})`, short: "Online" },
    { key: "offline", label: `Offline (${fleetDevices.filter((d) => nowMs - d.lastSeenMs >= offlineThresholdMs).length})`, short: "Offline" },
    { key: "alarm",   label: `Alarm (${new Set(serverAlarms.map((a) => a.deviceId)).size})`, short: "Alarm" },
  ];

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <AppShell activeNav="dashboard">
      <div className="flex flex-col gap-4 sm:gap-5">
        {/* Summary stats */}
        <SummaryRow
          devices={fleetDevices}
          nowMs={nowMs}
          serverAlarms={serverAlarms}
          offlineThresholdMs={offlineThresholdMs}
        />

        {/* Filter bar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {/* Filter tabs — scrollable on mobile */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
            {filterTabs.map(({ key, label, short }) => (
              <button
                key={key}
                onClick={() => { setFilterTab(key); setPage(1); }}
                type="button"
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all whitespace-nowrap ${
                  filterTab === key
                    ? "border-cyan-700 bg-cyan-900/40 text-cyan-300"
                    : "border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                }`}
                style={{ background: filterTab === key ? undefined : "var(--surface-1)" }}
              >
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Search + view toggle */}
          <div className="flex items-center gap-2">
            <input
              className="flex-1 sm:flex-none sm:w-52 rounded-lg border px-3 py-1.5 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-600"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}
              placeholder="Search UPS, location…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
            <div className="flex rounded-lg border border-slate-700 overflow-hidden shrink-0" style={{ background: "var(--surface-1)" }}>
              <button
                type="button"
                title="Card view"
                onClick={() => setViewMode("cards")}
                className={`px-2.5 py-1.5 transition-colors ${viewMode === "cards" ? "bg-cyan-900/40 text-cyan-300" : "text-slate-500 hover:text-slate-300"}`}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                title="List view"
                onClick={() => setViewMode("list")}
                className={`px-2.5 py-1.5 border-l border-slate-700 transition-colors ${viewMode === "list" ? "bg-cyan-900/40 text-cyan-300" : "text-slate-500 hover:text-slate-300"}`}
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {filtered.length === 0 ? (
          <div
            className="rounded-xl border p-10 sm:p-14 text-center"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
          >
            <Server size={36} className="mx-auto mb-4 text-slate-600" />
            <p className="text-sm font-semibold text-slate-400">
              {fleetDevices.length === 0
                ? "Waiting for UPS telemetry…"
                : "No devices match the current filter."}
            </p>
            {fleetDevices.length === 0 && (
              <p className="mt-2 text-xs text-slate-600">Devices appear here when they send MQTT telemetry.</p>
            )}
          </div>
        ) : (
          <>
            {viewMode === "cards" ? (
              <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {paginated.map((device) => (
                  <UpsCard
                    key={device.id}
                    device={device}
                    nowMs={nowMs}
                    deviceAlarms={alarmsByDevice.get(device.id) ?? []}
                    offlineThresholdMs={offlineThresholdMs}
                  />
                ))}
              </div>
            ) : (
              <section
                className="rounded-xl border overflow-hidden"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}
              >
                <CompactTable
                  devices={paginated}
                  nowMs={nowMs}
                  alarmsByDevice={alarmsByDevice}
                  offlineThresholdMs={offlineThresholdMs}
                />
              </section>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div
                className="flex items-center justify-between rounded-xl border px-4 py-3"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
              >
                <p className="text-sm text-slate-400">
                  {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-semibold text-slate-400 disabled:opacity-40 hover:border-slate-600 hover:text-slate-200 transition-colors"
                    type="button"
                  >
                    Prev
                  </button>
                  <span className="text-sm font-semibold text-slate-300">{safePage} / {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-semibold text-slate-400 disabled:opacity-40 hover:border-slate-600 hover:text-slate-200 transition-colors"
                    type="button"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
