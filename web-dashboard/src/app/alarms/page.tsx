"use client";

import { AlertTriangle, CheckCircle2, Clock, Search, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

function pill(active: boolean, color: "cyan" | "red" | "amber" | "emerald" | "slate" = "cyan") {
  const on: Record<string, string> = {
    cyan:    "border-cyan-700 bg-cyan-900/40 text-cyan-300",
    red:     "border-red-700 bg-red-900/40 text-red-300",
    amber:   "border-amber-700 bg-amber-900/40 text-amber-300",
    emerald: "border-emerald-700 bg-emerald-900/40 text-emerald-300",
    slate:   "border-slate-500 bg-slate-700/60 text-slate-200",
  };
  return `rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap transition-all ${
    active ? on[color] : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
  }`;
}

function AlarmCard({
  alarm, canAck, ackingId, ackComment,
  onAckOpen, onAckCancel, onAckCommentChange, onAckConfirm,
}: {
  alarm: AlarmRecord;
  canAck: boolean;
  ackingId: string | null;
  ackComment: string;
  onAckOpen: (id: string) => void;
  onAckCancel: () => void;
  onAckCommentChange: (v: string) => void;
  onAckConfirm: (id: string) => void;
}) {
  const isCritical = alarm.severity === "critical";
  const isActive   = alarm.state === "active";

  return (
    <div
      className={`rounded-lg border overflow-hidden iot-card ${
        isCritical && isActive ? "border-red-800" :
        !isCritical && isActive ? "border-amber-800" :
        "border-slate-700"
      }`}
      style={{
        background: "var(--surface-1)",
        boxShadow: isCritical && isActive ? "0 0 12px rgba(239,68,68,0.08)"
          : !isCritical && isActive ? "0 0 12px rgba(245,158,11,0.08)" : undefined,
      }}
    >
      <div className={`h-1 w-full ${
        isCritical && isActive ? "bg-red-500" :
        !isCritical && isActive ? "bg-amber-500" : "bg-slate-700"
      }`} />

      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
              isCritical ? "bg-red-900/50 text-red-400 border border-red-800"
                         : "bg-amber-900/50 text-amber-400 border border-amber-800"
            }`}>
              <AlertTriangle size={10} />
              {alarm.severity.toUpperCase()}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              isActive ? "bg-red-900/40 text-red-400" : "bg-emerald-900/40 text-emerald-400"
            }`}>
              {alarm.state}
            </span>
            {alarm.metric && alarm.metric !== "offline" && (
              <span className="font-mono text-xs text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                {alarm.metric}
              </span>
            )}
            {alarm.acknowledgedAt && (
              <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-900/30 text-emerald-400 border border-emerald-800">
                Acknowledged
              </span>
            )}
          </div>
          {isActive && !alarm.acknowledgedAt && canAck && ackingId !== alarm.id && (
            <button
              className="shrink-0 rounded-md border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
              onClick={() => onAckOpen(alarm.id)}
              type="button"
            >
              Acknowledge
            </button>
          )}
        </div>

        <p className="text-sm font-semibold text-slate-100 mb-2">{alarm.message}</p>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {alarm.upsId && (
            <Link href={`/ups/${alarm.upsId}`} className="font-semibold text-cyan-400 hover:text-cyan-300 hover:underline">
              {alarm.upsId}
            </Link>
          )}
          <span className="font-mono text-slate-500">{alarm.deviceId}</span>
          {(alarm.floor || alarm.location) && (
            <span>{[alarm.floor, alarm.location].filter(Boolean).join(" / ")}</span>
          )}
          <span>First seen: {new Date(alarm.firstSeenAt).toLocaleString()}</span>
          {alarm.clearedAt && <span>Cleared: {new Date(alarm.clearedAt).toLocaleString()}</span>}
          {alarm.acknowledgedAt && (
            <span className="text-emerald-400">Ack&apos;d by {alarm.acknowledgedBy ?? "—"}</span>
          )}
          {alarm.comment && <span className="italic">&quot;{alarm.comment}&quot;</span>}
        </div>

        {ackingId === alarm.id && (
          <div
            className="mt-3 flex items-center gap-2 rounded-md border border-slate-700 p-3"
            style={{ background: "var(--surface-2)" }}
          >
            <input
              className="flex-1 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500 transition-colors"
              style={{ background: "var(--surface-1)" }}
              placeholder="Optional comment…"
              value={ackComment}
              onChange={(e) => onAckCommentChange(e.target.value)}
              autoFocus
            />
            <button
              className="rounded-md bg-cyan-700 hover:bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors"
              onClick={() => onAckConfirm(alarm.id)}
              type="button"
            >
              Confirm
            </button>
            <button
              className="rounded-md border border-slate-600 p-1.5 text-slate-400 hover:bg-slate-700 transition-colors"
              onClick={onAckCancel}
              type="button"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const TIME_OPTIONS: { label: string; value: FilterTime }[] = [
  { label: "All time", value: "all" },
  { label: "Last 1h",  value: "1h"  },
  { label: "Last 24h", value: "24h" },
  { label: "Last 7d",  value: "7d"  },
  { label: "Last 30d", value: "30d" },
];

function cutoff(t: FilterTime): Date | null {
  if (t === "all") return null;
  const ms: Record<string, number> = { "1h": 3600e3, "24h": 86400e3, "7d": 7*86400e3, "30d": 30*86400e3 };
  return new Date(Date.now() - ms[t]);
}

export default function AlarmsPage() {
  const [alarms,     setAlarms]     = useState<AlarmRecord[]>([]);
  const [stateFilter, setStateFilter] = useState<FilterState>("active");
  const [severity,   setSeverity]   = useState<FilterSeverity>("all");
  const [ackFilter,  setAckFilter]  = useState<FilterAck>("all");
  const [timeFilter, setTimeFilter] = useState<FilterTime>("all");
  const [device,     setDevice]     = useState("all");
  const [search,     setSearch]     = useState("");
  const [loading,    setLoading]    = useState(true);
  const [ackComment, setAckComment] = useState("");
  const [ackingId,   setAckingId]   = useState<string | null>(null);
  const [userRole,   setUserRole]   = useState<UserRole>("viewer");

  useEffect(() => {
    setUserRole(readRole()); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);
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
      if (severity  !== "all" && a.severity  !== severity)  return false;
      if (device    !== "all" && a.deviceId  !== device)    return false;
      if (ackFilter === "acked"   && !a.acknowledgedAt)      return false;
      if (ackFilter === "unacked" &&  a.acknowledgedAt)      return false;
      if (since && new Date(a.firstSeenAt) < since)          return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          a.message.toLowerCase().includes(q) ||
          a.deviceId.toLowerCase().includes(q) ||
          (a.upsId     ?? "").toLowerCase().includes(q) ||
          (a.upsName   ?? "").toLowerCase().includes(q) ||
          (a.floor     ?? "").toLowerCase().includes(q) ||
          (a.location  ?? "").toLowerCase().includes(q) ||
          a.metric.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [alarms, severity, device, ackFilter, timeFilter, search]);

  const activeAlarms   = alarms.filter((a) => a.state === "active");
  const criticalAlarms = activeAlarms.filter((a) => a.severity === "critical");
  const warningAlarms  = activeAlarms.filter((a) => a.severity === "warning");

  const hasFilters = severity !== "all" || ackFilter !== "all" || timeFilter !== "all" || device !== "all" || search.trim() !== "";

  function clearFilters() {
    setSeverity("all");
    setAckFilter("all");
    setTimeFilter("all");
    setDevice("all");
    setSearch("");
  }

  return (
    <AppShell activeNav="alarms">
      <div className="flex flex-col gap-4 sm:gap-5 max-w-5xl iot-page">

        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-white">Alarm Management</h1>
          <p className="text-sm text-slate-400">Monitor and acknowledge UPS alarm conditions.</p>
        </div>

        {/* Summary counters */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div
            className="rounded-lg border border-red-900/60 p-3 sm:p-4 cursor-pointer transition-all hover:border-red-700"
            style={{ background: "var(--surface-1)", boxShadow: criticalAlarms.length ? "0 0 16px rgba(239,68,68,0.1)" : undefined }}
            onClick={() => { setSeverity(severity === "critical" ? "all" : "critical"); setStateFilter("active"); }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <AlertTriangle size={13} className={criticalAlarms.length ? "text-red-400 iot-blink" : "text-slate-600"} />
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide">Critical</p>
            </div>
            <p className={`text-2xl sm:text-3xl font-bold ${criticalAlarms.length ? "text-red-400" : "text-slate-500"}`}>{criticalAlarms.length}</p>
          </div>
          <div
            className="rounded-lg border border-amber-900/60 p-3 sm:p-4 cursor-pointer transition-all hover:border-amber-700"
            style={{ background: "var(--surface-1)" }}
            onClick={() => { setSeverity(severity === "warning" ? "all" : "warning"); setStateFilter("active"); }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <AlertTriangle size={13} className={warningAlarms.length ? "text-amber-400" : "text-slate-600"} />
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide">Warning</p>
            </div>
            <p className={`text-2xl sm:text-3xl font-bold ${warningAlarms.length ? "text-amber-400" : "text-slate-500"}`}>{warningAlarms.length}</p>
          </div>
          <div className="rounded-lg border border-slate-700 p-3 sm:p-4" style={{ background: "var(--surface-1)" }}>
            <div className="mb-1 flex items-center gap-1.5">
              <Clock size={13} className="text-slate-500" />
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide">Showing</p>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-slate-300">{filtered.length}</p>
            <p className="text-[10px] text-slate-600 mt-0.5">of {alarms.length} loaded</p>
          </div>
        </div>

        {/* ── Filter panel ─────────────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-700 p-4 flex flex-col gap-4" style={{ background: "var(--surface-1)" }}>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search message, device, metric, location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 pl-9 pr-8 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500 transition-colors"
            />
            {search && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300" onClick={() => setSearch("")} type="button">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Row 1 — State */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">State</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setStateFilter("active")}  className={pill(stateFilter === "active",  "red")}>🔴 Active</button>
              <button type="button" onClick={() => setStateFilter("cleared")} className={pill(stateFilter === "cleared", "emerald")}>✅ Cleared</button>
              <button type="button" onClick={() => setStateFilter("all")}     className={pill(stateFilter === "all",     "slate")}>All States</button>
            </div>
          </div>

          {/* Row 2 — Severity */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Severity</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSeverity("all")}      className={pill(severity === "all",      "cyan")}>All Severity</button>
              <button type="button" onClick={() => setSeverity("critical")} className={pill(severity === "critical", "red")}>🔴 Critical</button>
              <button type="button" onClick={() => setSeverity("warning")}  className={pill(severity === "warning",  "amber")}>⚠️ Warning</button>
            </div>
          </div>

          {/* Row 3 — Acknowledged */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Acknowledged</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setAckFilter("all")}     className={pill(ackFilter === "all",     "cyan")}>All</button>
              <button type="button" onClick={() => setAckFilter("unacked")} className={pill(ackFilter === "unacked", "amber")}>Not Acknowledged</button>
              <button type="button" onClick={() => setAckFilter("acked")}   className={pill(ackFilter === "acked",   "emerald")}>✅ Acknowledged</button>
            </div>
          </div>

          {/* Row 4 — Time range */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Time Range</p>
            <div className="flex flex-wrap gap-2">
              {TIME_OPTIONS.map(({ label, value }) => (
                <button key={value} type="button" onClick={() => setTimeFilter(value)} className={pill(timeFilter === value, "cyan")}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 5 — Device */}
          {deviceOptions.length > 1 && (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Device</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setDevice("all")} className={pill(device === "all", "cyan")}>All Devices</button>
                {deviceOptions.map((d) => (
                  <button key={d} type="button" onClick={() => setDevice(device === d ? "all" : d)} className={pill(device === d, "cyan")}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clear filters */}
          {hasFilters && (
            <div className="pt-1 border-t border-slate-700/60">
              <button
                type="button"
                onClick={clearFilters}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X size={12} /> Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Alarm list */}
        {loading ? (
          <div className="rounded-lg border border-slate-700 p-10 text-center text-sm text-slate-500 iot-shimmer" style={{ background: "var(--surface-1)" }}>
            Loading alarms…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-900/50 py-14 text-emerald-400" style={{ background: "var(--surface-1)" }}>
            <CheckCircle2 size={40} />
            <p className="font-semibold">
              {alarms.length === 0
                ? stateFilter === "active" ? "No active alarms — all systems normal." : "No alarms found."
                : "No alarms match the current filters."}
            </p>
            {hasFilters && (
              <button onClick={clearFilters} className="text-sm text-cyan-400 underline hover:text-cyan-300">Clear filters</button>
            )}
            <Link href="/" className="text-sm text-slate-500 underline hover:text-slate-300">Back to dashboard</Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((alarm) => (
              <AlarmCard
                key={alarm.id}
                alarm={alarm}
                canAck={canAck}
                ackingId={ackingId}
                ackComment={ackComment}
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
