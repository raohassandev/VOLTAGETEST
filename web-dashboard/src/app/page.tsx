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
  VOLT_DC_SCALE,
} from "@/lib/telemetry";

// ── Helpers ───────────────────────────────────────────────────────────────────

function alarmTone(alarms: ServerAlarm[]) {
  if (alarms.some((a) => a.severity === "critical")) return "critical";
  if (alarms.length > 0) return "warning";
  return "normal";
}

// ── Summary row ───────────────────────────────────────────────────────────────

function SummaryRow({
  devices,
  nowMs,
  serverAlarms,
}: {
  devices: FleetDevice[];
  nowMs: number;
  serverAlarms: ServerAlarm[];
}) {
  const online = devices.filter((d) => nowMs - d.lastSeenMs < 60_000).length;
  const offline = devices.length - online;
  const critCount = serverAlarms.filter((a) => a.severity === "critical").length;
  const warnCount = serverAlarms.filter((a) => a.severity === "warning").length;
  const totalVa = devices.reduce((s, d) => s + Number(d.telemetry.s_out_va ?? 0), 0);

  const stats = [
    { label: "Total UPS",      value: devices.length,        icon: Cpu,          color: "text-slate-700",   bg: "bg-slate-100",  href: null },
    { label: "Online",         value: online,                icon: Wifi,         color: "text-emerald-700", bg: "bg-emerald-50", href: null },
    { label: "Offline",        value: offline,               icon: WifiOff,      color: offline ? "text-red-700" : "text-slate-500", bg: offline ? "bg-red-50" : "bg-slate-100", href: null },
    { label: "Critical alarms",value: critCount,             icon: AlertTriangle,color: critCount ? "text-red-700" : "text-slate-500", bg: critCount ? "bg-red-50" : "bg-slate-100", href: "/alarms" },
    { label: "Warnings",       value: warnCount,             icon: AlertTriangle,color: warnCount ? "text-amber-700" : "text-slate-500", bg: warnCount ? "bg-amber-50" : "bg-slate-100", href: "/alarms" },
    { label: "Total output VA",value: formatNumber(totalVa), icon: Gauge,        color: "text-blue-700",    bg: "bg-blue-50",    href: null },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((s) => {
        const Icon = s.icon;
        const inner = (
          <>
            <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-md ${s.bg}`}>
              <Icon size={16} className={s.color} />
            </div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{s.label}</p>
            <p className={`mt-0.5 text-xl font-bold ${s.color}`}>{s.value}</p>
          </>
        );
        return s.href ? (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 hover:shadow-md transition-shadow"
          >
            {inner}
          </Link>
        ) : (
          <div key={s.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

// ── UPS card ──────────────────────────────────────────────────────────────────

function UpsCard({
  device,
  nowMs,
  deviceAlarms,
}: {
  device: FleetDevice;
  nowMs: number;
  deviceAlarms: ServerAlarm[];
}) {
  const online = nowMs - device.lastSeenMs < 60_000;
  const tone = alarmTone(deviceAlarms);
  const upsId = device.inventory?.upsId || device.telemetry.ups_id || device.id;
  const location = [device.inventory?.floor, device.inventory?.location].filter(Boolean).join(" / ") || null;
  const boardIp = device.telemetry.ip || null;

  const capacityVa = device.inventory?.capacityVa ?? 0;
  const loadPct = capacityVa > 0
    ? (Number(device.telemetry.s_out_va ?? 0) / capacityVa) * 100
    : null;

  const voltDcDisplay = device.telemetry.volt_dc != null
    ? formatNumber(Number(device.telemetry.volt_dc) * VOLT_DC_SCALE)
    : "--";

  const borderColor =
    !online ? "border-slate-200" :
    tone === "critical" ? "border-red-200" :
    tone === "warning" ? "border-amber-200" :
    "border-slate-200";

  const headerBg =
    !online ? "bg-slate-50" :
    tone === "critical" ? "bg-red-50" :
    tone === "warning" ? "bg-amber-50" :
    "bg-white";

  return (
    <div className={`flex flex-col rounded-lg border bg-white shadow-sm overflow-hidden ${borderColor}`}>
      {/* Card header */}
      <div className={`flex items-start justify-between gap-2 p-4 pb-3 ${headerBg}`}>
        <div className="min-w-0">
          <p className="truncate font-bold text-slate-950 leading-tight">{upsId}</p>
          {location && (
            <p className="mt-0.5 truncate text-xs text-slate-500">{location}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {online ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
              <Wifi size={10} /> Online
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">
              <WifiOff size={10} /> Offline
            </span>
          )}
          {tone === "critical" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
              <AlertTriangle size={10} /> CRITICAL
            </span>
          )}
          {tone === "warning" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
              <AlertTriangle size={10} /> WARNING
            </span>
          )}
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-4 divide-x divide-slate-100 border-t border-slate-100 text-center">
        {[
          { label: "In V",    value: formatNumber(Number(device.telemetry.volt_in ?? 0)) },
          { label: "Out V",   value: formatNumber(Number(device.telemetry.volt_out ?? 0)) },
          { label: "Bat V",   value: voltDcDisplay },
          { label: "Load %",  value: loadPct !== null ? `${formatNumber(loadPct)}%` : "--" },
        ].map(({ label, value }) => (
          <div key={label} className="py-2.5">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="text-sm font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-4 divide-x divide-slate-100 border-t border-slate-100 text-center">
        {[
          { label: "Out A",   value: formatNumber(Number(device.telemetry.ct_out ?? 0)) },
          { label: "Out VA",  value: formatNumber(Number(device.telemetry.s_out_va ?? 0)) },
          { label: "RSSI",    value: device.telemetry.rssi ? `${device.telemetry.rssi}` : "--" },
          { label: "In A",    value: formatNumber(Number(device.telemetry.ct_in ?? 0)) },
        ].map(({ label, value }) => (
          <div key={label} className="py-2">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="text-sm font-semibold text-slate-700">{value}</p>
          </div>
        ))}
      </div>

      {/* Board IP */}
      <div className="border-t border-slate-100 px-4 py-2">
        {boardIp ? (
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-slate-500">{boardIp}</span>
            <div className="flex gap-1">
              <a href={`http://${boardIp}/`} target="_blank" rel="noreferrer" className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-200" title="Open board portal">
                <ExternalLink size={10} className="inline" /> Portal
              </a>
              <a href={`http://${boardIp}/config`} target="_blank" rel="noreferrer" className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">Config</a>
              <a href={`http://${boardIp}/update`} target="_blank" rel="noreferrer" className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">OTA</a>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">Board IP not available</p>
        )}
      </div>

      {/* Footer actions */}
      <div className="mt-auto flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2.5">
        <span className="text-xs text-slate-400">
          {device.lastMessageAt}
        </span>
        <Link
          href={`/ups/${upsId}`}
          className="inline-flex items-center gap-1 rounded-md bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
        >
          Details <ArrowRight size={11} />
        </Link>
      </div>
    </div>
  );
}

// ── Compact table ─────────────────────────────────────────────────────────────

function CompactTable({
  devices,
  nowMs,
  alarmsByDevice,
}: {
  devices: FleetDevice[];
  nowMs: number;
  alarmsByDevice: Map<string, ServerAlarm[]>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase tracking-wide">
            <th className="py-2 pr-3 w-28">UPS</th>
            <th className="py-2 pr-3 w-28">Location</th>
            <th className="py-2 pr-3 w-14">In V</th>
            <th className="py-2 pr-3 w-14">Out V</th>
            <th className="py-2 pr-3 w-14">Bat V</th>
            <th className="py-2 pr-3 w-14">Out A</th>
            <th className="py-2 pr-3 w-16">Out VA</th>
            <th className="py-2 pr-3 w-14">Load %</th>
            <th className="py-2 pr-3 w-16">RSSI</th>
            <th className="py-2 pr-3 w-28">Board IP</th>
            <th className="py-2 pr-3 w-20">Status</th>
            <th className="py-2 w-24">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {devices.length === 0 ? (
            <tr>
              <td className="py-5 text-slate-400 text-xs" colSpan={12}>
                No UPS devices found.
              </td>
            </tr>
          ) : (
            devices.map((device) => {
              const alarms = alarmsByDevice.get(device.id) ?? [];
              const online = nowMs - device.lastSeenMs < 60_000;
              const tone = alarmTone(alarms);
              const upsId = device.inventory?.upsId || device.telemetry.ups_id || device.id;
              const capacityVa = device.inventory?.capacityVa ?? 0;
              const loadPct = capacityVa > 0
                ? (Number(device.telemetry.s_out_va ?? 0) / capacityVa) * 100
                : null;
              const boardIp = device.telemetry.ip || "";
              const voltDcDisplay = device.telemetry.volt_dc != null
                ? formatNumber(Number(device.telemetry.volt_dc) * VOLT_DC_SCALE)
                : "--";

              return (
                <tr
                  key={device.id}
                  className={`border-b border-slate-100 transition-colors hover:bg-slate-50 ${!online ? "opacity-60" : ""}`}
                >
                  <td className="py-2.5 pr-3 font-semibold">
                    <Link href={`/ups/${upsId}`} className="text-blue-700 hover:underline">
                      {upsId}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-3 text-slate-500 text-xs">
                    {[device.inventory?.floor, device.inventory?.location].filter(Boolean).join(" / ") || "--"}
                  </td>
                  <td className="py-2.5 pr-3">{formatNumber(Number(device.telemetry.volt_in ?? 0))}</td>
                  <td className="py-2.5 pr-3">{formatNumber(Number(device.telemetry.volt_out ?? 0))}</td>
                  <td className="py-2.5 pr-3">{voltDcDisplay}</td>
                  <td className="py-2.5 pr-3">{formatNumber(Number(device.telemetry.ct_out ?? 0))}</td>
                  <td className="py-2.5 pr-3">{formatNumber(Number(device.telemetry.s_out_va ?? 0))}</td>
                  <td className="py-2.5 pr-3">
                    {loadPct !== null ? (
                      <span className={loadPct > 95 ? "font-bold text-red-700" : loadPct > 80 ? "font-semibold text-amber-700" : ""}>
                        {formatNumber(loadPct)}%
                      </span>
                    ) : "--"}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-slate-500">
                    {device.telemetry.rssi ? `${device.telemetry.rssi} dBm` : "--"}
                  </td>
                  <td className="py-2.5 pr-3">
                    {boardIp ? (
                      <a href={`http://${boardIp}/`} target="_blank" rel="noreferrer" className="font-mono text-xs text-blue-700 hover:underline">
                        {boardIp}
                      </a>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      !online ? "bg-slate-100 text-slate-500" :
                      tone === "critical" ? "bg-red-100 text-red-700" :
                      tone === "warning" ? "bg-amber-100 text-amber-700" :
                      "bg-emerald-100 text-emerald-700"
                    }`}>
                      {!online ? "offline" : tone === "critical" ? "critical" : tone === "warning" ? "warning" : "normal"}
                    </span>
                  </td>
                  <td className="py-2.5 text-xs text-slate-400">{device.lastMessageAt}</td>
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
  const { fleetDevices, serverAlarms } = useTelemetry();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 5_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, filterTab]);

  const alarmsByDevice = new Map<string, ServerAlarm[]>();
  for (const a of serverAlarms) {
    const list = alarmsByDevice.get(a.deviceId) ?? [];
    list.push(a);
    alarmsByDevice.set(a.deviceId, list);
  }

  const filtered = fleetDevices.filter((d) => {
    const upsId = d.inventory?.upsId || d.telemetry.ups_id || d.id;
    const online = nowMs - d.lastSeenMs < 60_000;
    const hasAlarm = (alarmsByDevice.get(d.id) ?? []).length > 0;

    if (filterTab === "online" && !online) return false;
    if (filterTab === "offline" && online) return false;
    if (filterTab === "alarm" && !hasAlarm) return false;

    if (!search) return true;
    const q = search.toLowerCase();
    return (
      upsId.toLowerCase().includes(q) ||
      (d.telemetry.device_id ?? "").toLowerCase().includes(q) ||
      (d.inventory?.floor ?? "").toLowerCase().includes(q) ||
      (d.inventory?.location ?? "").toLowerCase().includes(q)
    );
  });

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: "all",     label: `All (${fleetDevices.length})` },
    { key: "online",  label: `Online (${fleetDevices.filter((d) => nowMs - d.lastSeenMs < 60_000).length})` },
    { key: "offline", label: `Offline (${fleetDevices.filter((d) => nowMs - d.lastSeenMs >= 60_000).length})` },
    { key: "alarm",   label: `Alarm (${new Set(serverAlarms.map((a) => a.deviceId)).size})` },
  ];

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <AppShell activeNav="dashboard">
      <div className="flex flex-col gap-5">
        {/* Summary stats */}
        <SummaryRow devices={fleetDevices} nowMs={nowMs} serverAlarms={serverAlarms} />

        {/* Filter + search + view toggle */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1">
            {filterTabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterTab(key)}
                type="button"
                className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors ${
                  filterTab === key
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 sm:w-52"
              placeholder="Search UPS, device, location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {/* View toggle */}
            <div className="flex rounded-md border border-slate-300 bg-white overflow-hidden shrink-0">
              <button
                type="button"
                title="Card view"
                onClick={() => setViewMode("cards")}
                className={`px-2.5 py-1.5 ${viewMode === "cards" ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                title="List view"
                onClick={() => setViewMode("list")}
                className={`px-2.5 py-1.5 border-l border-slate-300 ${viewMode === "list" ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Devices — cards or list */}
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center shadow-sm">
            <Server size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">
              {fleetDevices.length === 0 ? "Waiting for UPS telemetry…" : "No devices match the current filter."}
            </p>
          </div>
        ) : (
          <>
            {viewMode === "cards" ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {paginated.map((device) => (
                  <UpsCard
                    key={device.id}
                    device={device}
                    nowMs={nowMs}
                    deviceAlarms={alarmsByDevice.get(device.id) ?? []}
                  />
                ))}
              </div>
            ) : (
              <section className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                <CompactTable devices={paginated} nowMs={nowMs} alarmsByDevice={alarmsByDevice} />
              </section>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-sm text-slate-500">
                  Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                    type="button"
                  >
                    Prev
                  </button>
                  <span className="text-sm font-semibold text-slate-700">{safePage} / {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50"
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
