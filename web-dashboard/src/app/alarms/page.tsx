"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { checkUnauthorized } from "@/lib/handle-unauthorized";
import type { UserRole } from "@/lib/auth";

function readRole(): UserRole {
  if (typeof document === "undefined") return "viewer";
  const m = document.cookie.match(/(?:^|;\s*)ups_user=([^;]*)/);
  if (!m) return "viewer";
  try {
    const value = decodeURIComponent(m[1]);
    const payload = value.includes(".") ? value.slice(0, value.lastIndexOf(".")) : value;
    return (JSON.parse(atob(payload)) as { role?: UserRole }).role ?? "viewer";
  } catch { return "viewer"; }
}

interface AlarmRecord {
  id: string;
  deviceId: string;
  upsId: string | null;
  upsName: string | null;
  floor: string | null;
  location: string | null;
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

type FilterState    = "active" | "cleared" | "all";
type FilterSeverity = "all" | "critical" | "warning";
type FilterAck      = "all" | "acked" | "unacked";
type FilterTime     = "all" | "1h" | "24h" | "7d" | "30d";

const TIME_OPTIONS: { label: string; value: FilterTime }[] = [
  { label: "All time", value: "all"  },
  { label: "1 h",      value: "1h"   },
  { label: "24 h",     value: "24h"  },
  { label: "7 days",   value: "7d"   },
  { label: "30 days",  value: "30d"  },
];

function cutoff(t: FilterTime): Date | null {
  if (t === "all") return null;
  const ms: Record<string, number> = { "1h": 3_600e3, "24h": 86_400e3, "7d": 7 * 86_400e3, "30d": 30 * 86_400e3 };
  return new Date(Date.now() - ms[t]);
}

// ── Pill button ───────────────────────────────────────────────────────────────
function Pill({
  active, color = "cyan", onClick, children,
}: {
  active: boolean;
  color?: "cyan" | "red" | "amber" | "emerald" | "slate";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const on: Record<string, string> = {
    cyan:    "border-cyan-600 bg-cyan-900/50 text-cyan-300 shadow-sm shadow-cyan-900/30",
    red:     "border-red-600 bg-red-900/50 text-red-300 shadow-sm shadow-red-900/30",
    amber:   "border-amber-600 bg-amber-900/50 text-amber-300 shadow-sm shadow-amber-900/30",
    emerald: "border-emerald-600 bg-emerald-900/50 text-emerald-300 shadow-sm shadow-emerald-900/30",
    slate:   "border-slate-500 bg-slate-700/60 text-slate-200",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition-all ${
        active ? on[color] : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200 hover:bg-slate-800/40"
      }`}
    >
      {children}
    </button>
  );
}

// ── Filter group ──────────────────────────────────────────────────────────────
function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

// ── Alarm card ────────────────────────────────────────────────────────────────
function AlarmCard({
  alarm, canAck, ackingId, ackComment,
  onAckOpen, onAckCancel, onAckCommentChange, onAckConfirm,
}: {
  alarm: AlarmRecord; canAck: boolean; ackingId: string | null; ackComment: string;
  onAckOpen: (id: string) => void; onAckCancel: () => void;
  onAckCommentChange: (v: string) => void; onAckConfirm: (id: string) => void;
}) {
  const isCritical = alarm.severity === "critical";
  const isActive   = alarm.state   === "active";

  return (
    <div
      className={`rounded-xl border overflow-hidden transition-shadow ${
        isCritical && isActive ? "border-red-800/70 hover:border-red-700" :
        !isCritical && isActive ? "border-amber-800/70 hover:border-amber-700" :
        "border-slate-700 hover:border-slate-600"
      }`}
      style={{
        background: "var(--surface-1)",
        boxShadow: isCritical && isActive ? "0 0 16px rgba(239,68,68,0.07)"
          : !isCritical && isActive ? "0 0 16px rgba(245,158,11,0.07)" : undefined,
      }}
    >
      {/* colour bar */}
      <div className={`h-0.5 w-full ${
        isCritical && isActive ? "bg-gradient-to-r from-red-500 to-red-700" :
        !isCritical && isActive ? "bg-gradient-to-r from-amber-500 to-amber-700" :
        "bg-slate-700"
      }`} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
              isCritical ? "bg-red-900/50 text-red-400 border border-red-800"
                         : "bg-amber-900/50 text-amber-400 border border-amber-800"
            }`}>
              <AlertTriangle size={10} />
              {alarm.severity.toUpperCase()}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              isActive ? "bg-red-900/30 text-red-400" : "bg-emerald-900/30 text-emerald-400"
            }`}>
              {alarm.state}
            </span>
            {alarm.metric && alarm.metric !== "offline" && (
              <span className="font-mono text-xs text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700">
                {alarm.metric}
              </span>
            )}
            {alarm.acknowledgedAt && (
              <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-900/30 text-emerald-400 border border-emerald-800/60">
                ✓ Acknowledged
              </span>
            )}
          </div>
          {isActive && !alarm.acknowledgedAt && canAck && ackingId !== alarm.id && (
            <button
              className="shrink-0 rounded-lg border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:border-slate-500 transition-colors"
              onClick={() => onAckOpen(alarm.id)} type="button"
            >
              Acknowledge
            </button>
          )}
        </div>

        <p className="text-sm font-semibold text-slate-100 mb-2.5">{alarm.message}</p>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {alarm.upsId && (
            <Link href={`/ups/${alarm.upsId}`} className="font-semibold text-cyan-400 hover:text-cyan-300 hover:underline">
              {alarm.upsId}
            </Link>
          )}
          <span className="font-mono">{alarm.deviceId}</span>
          {(alarm.floor || alarm.location) && <span>{[alarm.floor, alarm.location].filter(Boolean).join(" / ")}</span>}
          <span>First: {new Date(alarm.firstSeenAt).toLocaleString()}</span>
          {alarm.clearedAt && <span>Cleared: {new Date(alarm.clearedAt).toLocaleString()}</span>}
          {alarm.acknowledgedAt && <span className="text-emerald-400">by {alarm.acknowledgedBy ?? "—"}</span>}
          {alarm.comment && <span className="italic text-slate-600">&quot;{alarm.comment}&quot;</span>}
        </div>

        {ackingId === alarm.id && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-700 p-3" style={{ background: "var(--surface-2)" }}>
            <input
              className="flex-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500 transition-colors"
              style={{ background: "var(--surface-1)" }}
              placeholder="Optional comment…"
              value={ackComment}
              onChange={(e) => onAckCommentChange(e.target.value)}
              autoFocus
            />
            <button className="rounded-md bg-cyan-700 hover:bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors" onClick={() => onAckConfirm(alarm.id)} type="button">Confirm</button>
            <button className="rounded-md border border-slate-600 p-1.5 text-slate-400 hover:bg-slate-700 transition-colors" onClick={onAckCancel} type="button"><X size={14} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AlarmsPage() {
  const [alarms,      setAlarms]      = useState<AlarmRecord[]>([]);
  const [stateFilter, setStateFilter] = useState<FilterState>("active");
  const [severity,    setSeverity]    = useState<FilterSeverity>("all");
  const [ackFilter,   setAckFilter]   = useState<FilterAck>("all");
  const [timeFilter,  setTimeFilter]  = useState<FilterTime>("all");
  const [device,      setDevice]      = useState("all");
  const [search,      setSearch]      = useState("");
  const [loading,     setLoading]     = useState(true);
  const [ackComment,  setAckComment]  = useState("");
  const [ackingId,    setAckingId]    = useState<string | null>(null);
  const [userRole] = useState<UserRole>(() => readRole());
  const [filtersOpen, setFiltersOpen] = useState(() => {
    if (typeof sessionStorage === "undefined") return false;
    return sessionStorage.getItem("alarms_filters_open") === "true";
  });
  const filterRef = useRef<HTMLDivElement>(null);

  function toggleFilters() {
    setFiltersOpen((v) => {
      sessionStorage.setItem("alarms_filters_open", String(!v));
      return !v;
    });
  }

  const canAck = userRole !== "viewer";

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/alarms?state=${stateFilter}&limit=500`, { cache: "no-store" });
      if (checkUnauthorized(res)) return;
      if (!res.ok) return;
      const data = (await res.json()) as { alarms: AlarmRecord[] };
      setAlarms(data.alarms);
    } finally {
      setLoading(false);
    }
  }, [stateFilter]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 15_000);
    return () => window.clearInterval(t);
  }, [load]);

  async function acknowledge(id: string) {
    await fetch(`/api/alarms/${id}/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: ackComment }),
    });
    setAckingId(null);
    setAckComment("");
    load();
  }

  const deviceOptions = useMemo(() => [...new Set(alarms.map((a) => a.deviceId))].sort(), [alarms]);

  const filtered = useMemo(() => {
    const since = cutoff(timeFilter);
    return alarms.filter((a) => {
      if (severity  !== "all"    && a.severity !== severity)  return false;
      if (device    !== "all"    && a.deviceId !== device)    return false;
      if (ackFilter === "acked"   && !a.acknowledgedAt)        return false;
      if (ackFilter === "unacked" &&  a.acknowledgedAt)        return false;
      if (since && new Date(a.firstSeenAt) < since)            return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          a.message.toLowerCase().includes(q) ||
          a.deviceId.toLowerCase().includes(q) ||
          (a.upsId    ?? "").toLowerCase().includes(q) ||
          (a.upsName  ?? "").toLowerCase().includes(q) ||
          (a.floor    ?? "").toLowerCase().includes(q) ||
          (a.location ?? "").toLowerCase().includes(q) ||
          a.metric.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [alarms, severity, device, ackFilter, timeFilter, search]);

  const criticalCount = alarms.filter((a) => a.state === "active" && a.severity === "critical").length;
  const warningCount  = alarms.filter((a) => a.state === "active" && a.severity === "warning").length;

  const activeFilterCount =
    (severity   !== "all" ? 1 : 0) +
    (ackFilter  !== "all" ? 1 : 0) +
    (timeFilter !== "all" ? 1 : 0) +
    (device     !== "all" ? 1 : 0) +
    (search.trim() ? 1 : 0);

  function clearFilters() {
    setSeverity("all"); setAckFilter("all"); setTimeFilter("all"); setDevice("all"); setSearch("");
  }

  // ── Active filter chips (shown in collapsed header) ────────────────────────
  const filterChips: { label: string; clear: () => void }[] = [
    ...(stateFilter !== "active" ? [{ label: stateFilter, clear: () => setStateFilter("active") }] : []),
    ...(severity !== "all"   ? [{ label: severity,   clear: () => setSeverity("all")   }] : []),
    ...(ackFilter !== "all"  ? [{ label: ackFilter,  clear: () => setAckFilter("all")  }] : []),
    ...(timeFilter !== "all" ? [{ label: TIME_OPTIONS.find(t => t.value === timeFilter)?.label ?? timeFilter, clear: () => setTimeFilter("all") }] : []),
    ...(device !== "all"     ? [{ label: device,     clear: () => setDevice("all")     }] : []),
    ...(search.trim()        ? [{ label: `"${search.slice(0, 16)}${search.length > 16 ? "…" : ""}"`, clear: () => setSearch("") }] : []),
  ];

  return (
    <AppShell activeNav="alarms">
      <div className="flex flex-col gap-4 sm:gap-5 max-w-5xl iot-page">

        {/* ── Page header ───────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-white">Alarm Management</h1>
          <p className="text-sm text-slate-400 mt-0.5">Monitor and acknowledge UPS alarm conditions.</p>
        </div>

        {/* ── Summary cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {/* Critical */}
          <div
            className={`rounded-xl border p-3 sm:p-4 cursor-pointer transition-all ${
              severity === "critical" ? "border-red-600 ring-1 ring-red-700/50" : "border-red-900/50 hover:border-red-700/60"
            }`}
            style={{ background: "var(--surface-1)", boxShadow: criticalCount ? "0 0 20px rgba(239,68,68,0.08)" : undefined }}
            onClick={() => { setSeverity(severity === "critical" ? "all" : "critical"); setStateFilter("active"); }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle size={12} className={criticalCount ? "text-red-400 iot-blink" : "text-slate-600"} />
              <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide">Critical</p>
            </div>
            <p className={`text-2xl sm:text-3xl font-bold ${criticalCount ? "text-red-400" : "text-slate-600"}`}>{criticalCount}</p>
          </div>
          {/* Warning */}
          <div
            className={`rounded-xl border p-3 sm:p-4 cursor-pointer transition-all ${
              severity === "warning" ? "border-amber-600 ring-1 ring-amber-700/50" : "border-amber-900/50 hover:border-amber-700/60"
            }`}
            style={{ background: "var(--surface-1)" }}
            onClick={() => { setSeverity(severity === "warning" ? "all" : "warning"); setStateFilter("active"); }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle size={12} className={warningCount ? "text-amber-400" : "text-slate-600"} />
              <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide">Warning</p>
            </div>
            <p className={`text-2xl sm:text-3xl font-bold ${warningCount ? "text-amber-400" : "text-slate-600"}`}>{warningCount}</p>
          </div>
          {/* Showing */}
          <div className="rounded-xl border border-slate-700 p-3 sm:p-4" style={{ background: "var(--surface-1)" }}>
            <div className="flex items-center gap-1.5 mb-1">
              <Clock size={12} className="text-slate-500" />
              <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide">Showing</p>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-slate-300">{filtered.length}</p>
            <p className="text-[10px] text-slate-600 mt-0.5">of {alarms.length}</p>
          </div>
        </div>

        {/* ── Filter panel ──────────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-700 overflow-hidden" style={{ background: "var(--surface-1)" }}>

          {/* Header — always visible */}
          <button
            type="button"
            onClick={toggleFilters}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/40 transition-colors"
          >
            <SlidersHorizontal size={15} className={activeFilterCount > 0 ? "text-cyan-400" : "text-slate-500"} />
            <span className="text-sm font-semibold text-slate-300 flex-1 text-left">Filters</span>

            {/* Active filter chips — shown when collapsed */}
            {!filtersOpen && filterChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 flex-1 justify-start">
                {filterChips.map((chip) => (
                  <span
                    key={chip.label}
                    className="inline-flex items-center gap-1 rounded-full border border-cyan-700/60 bg-cyan-900/30 px-2 py-0.5 text-[10px] font-semibold text-cyan-300"
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            )}

            {/* Badge */}
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-cyan-600 text-white text-[10px] font-bold px-1.5 py-0.5 leading-none shrink-0">
                {activeFilterCount}
              </span>
            )}

            <ChevronDown
              size={15}
              className={`text-slate-500 shrink-0 transition-transform duration-200 ${filtersOpen ? "rotate-180" : ""}`}
            />
          </button>

          {/* Collapsible body */}
          <div
            ref={filterRef}
            className="overflow-hidden transition-all duration-300 ease-in-out"
            style={{ maxHeight: filtersOpen ? "600px" : "0px", opacity: filtersOpen ? 1 : 0 }}
          >
            <div className="px-4 pb-4 pt-1 border-t border-slate-700/60 flex flex-col gap-4">

              {/* Search */}
              <div className="relative mt-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search message, device, metric, location…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-900/80 pl-8 pr-8 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
                />
                {search && (
                  <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" onClick={() => setSearch("")} type="button">
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Filter rows */}
              <div className="grid gap-3 sm:grid-cols-2">

                <FilterGroup label="State">
                  <Pill active={stateFilter === "active"}  color="red"     onClick={() => setStateFilter("active")}>🔴 Active</Pill>
                  <Pill active={stateFilter === "cleared"} color="emerald" onClick={() => setStateFilter("cleared")}>✅ Cleared</Pill>
                  <Pill active={stateFilter === "all"}     color="slate"   onClick={() => setStateFilter("all")}>All</Pill>
                </FilterGroup>

                <FilterGroup label="Severity">
                  <Pill active={severity === "critical"} color="red"   onClick={() => setSeverity(severity === "critical" ? "all" : "critical")}>🔴 Critical</Pill>
                  <Pill active={severity === "warning"}  color="amber" onClick={() => setSeverity(severity === "warning"  ? "all" : "warning")}>⚠️ Warning</Pill>
                  <Pill active={severity === "all"}      color="cyan"  onClick={() => setSeverity("all")}>All</Pill>
                </FilterGroup>

                <FilterGroup label="Acknowledged">
                  <Pill active={ackFilter === "unacked"} color="amber"   onClick={() => setAckFilter(ackFilter === "unacked" ? "all" : "unacked")}>Pending</Pill>
                  <Pill active={ackFilter === "acked"}   color="emerald" onClick={() => setAckFilter(ackFilter === "acked"   ? "all" : "acked")}>✅ Acknowledged</Pill>
                  <Pill active={ackFilter === "all"}     color="cyan"    onClick={() => setAckFilter("all")}>All</Pill>
                </FilterGroup>

                <FilterGroup label="Time Range">
                  {TIME_OPTIONS.map(({ label, value }) => (
                    <Pill key={value} active={timeFilter === value} color="cyan" onClick={() => setTimeFilter(value)}>{label}</Pill>
                  ))}
                </FilterGroup>

              </div>

              {/* Device filter — full width */}
              {deviceOptions.length > 1 && (
                <FilterGroup label="Device">
                  <Pill active={device === "all"} color="cyan" onClick={() => setDevice("all")}>All Devices</Pill>
                  {deviceOptions.map((d) => (
                    <Pill key={d} active={device === d} color="cyan" onClick={() => setDevice(device === d ? "all" : d)}>{d}</Pill>
                  ))}
                </FilterGroup>
              )}

              {/* Clear all */}
              {activeFilterCount > 0 && (
                <div className="flex justify-end pt-1 border-t border-slate-700/50">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <X size={11} /> Clear all filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Alarm list ────────────────────────────────────────────── */}
        {loading ? (
          <div className="rounded-xl border border-slate-700 p-10 text-center text-sm text-slate-500 iot-shimmer" style={{ background: "var(--surface-1)" }}>
            Loading alarms…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-900/40 py-16 text-emerald-400" style={{ background: "var(--surface-1)" }}>
            <CheckCircle2 size={40} />
            <p className="font-semibold">
              {alarms.length === 0
                ? stateFilter === "active" ? "No active alarms — all systems normal." : "No alarms found."
                : "No alarms match the current filters."}
            </p>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-sm text-cyan-400 underline hover:text-cyan-300">Clear filters</button>
            )}
            <Link href="/" className="text-sm text-slate-500 underline hover:text-slate-300">Back to dashboard</Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((alarm) => (
              <AlarmCard
                key={alarm.id} alarm={alarm} canAck={canAck}
                ackingId={ackingId} ackComment={ackComment}
                onAckOpen={(id) => { setAckingId(id); setAckComment(""); }}
                onAckCancel={() => setAckingId(null)}
                onAckCommentChange={setAckComment}
                onAckConfirm={acknowledge}
              />
            ))}
          </div>
        )}

      </div>
    </AppShell>
  );
}
