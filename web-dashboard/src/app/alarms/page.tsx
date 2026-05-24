"use client";

import { AlertTriangle, CheckCircle2, Clock, Filter, Search, X } from "lucide-react";
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

function AlarmCard({
  alarm,
  canAck,
  ackingId,
  ackComment,
  onAckOpen,
  onAckCancel,
  onAckCommentChange,
  onAckConfirm,
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
        boxShadow: isCritical && isActive
          ? "0 0 12px rgba(239,68,68,0.08)"
          : !isCritical && isActive
          ? "0 0 12px rgba(245,158,11,0.08)"
          : undefined,
      }}
    >
      {/* Top colour bar */}
      <div className={`h-1 w-full ${
        isCritical && isActive ? "bg-red-500" :
        !isCritical && isActive ? "bg-amber-500" :
        "bg-slate-700"
      }`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
              isCritical ? "bg-red-900/50 text-red-400 border border-red-800" : "bg-amber-900/50 text-amber-400 border border-amber-800"
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
          {alarm.state === "active" && !alarm.acknowledgedAt && canAck && ackingId !== alarm.id && (
            <button
              className="shrink-0 rounded-md border border-slate-600 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
              onClick={() => onAckOpen(alarm.id)}
              type="button"
            >
              Acknowledge
            </button>
          )}
        </div>

        {/* Message */}
        <p className="text-sm font-semibold text-slate-100 mb-2">{alarm.message}</p>

        {/* Meta row */}
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
          {alarm.clearedAt && (
            <span>Cleared: {new Date(alarm.clearedAt).toLocaleString()}</span>
          )}
          {alarm.acknowledgedAt && (
            <span className="text-emerald-400">Ack&apos;d by {alarm.acknowledgedBy ?? "—"}</span>
          )}
          {alarm.comment && (
            <span className="italic text-slate-500">&quot;{alarm.comment}&quot;</span>
          )}
        </div>

        {/* Ack inline form */}
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

export default function AlarmsPage() {
  const [alarms,    setAlarms]    = useState<AlarmRecord[]>([]);
  const [filter,    setFilter]    = useState<FilterState>("active");
  const [severity,  setSeverity]  = useState<FilterSeverity>("all");
  const [search,    setSearch]    = useState("");
  const [device,    setDevice]    = useState("all");
  const [ackFilter, setAckFilter] = useState<FilterAck>("all");
  const [loading,   setLoading]   = useState(true);
  const [ackComment, setAckComment] = useState("");
  const [ackingId,  setAckingId]  = useState<string | null>(null);
  const [userRole,  setUserRole]  = useState<UserRole>("viewer");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    setUserRole(readRole()); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);
  const canAck = userRole !== "viewer";

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/alarms?state=${filter}&limit=500`, { cache: "no-store" });
      if (checkUnauthorized(res)) return;
      if (!res.ok) return;
      const data = (await res.json()) as { alarms: AlarmRecord[] };
      setAlarms(data.alarms);
    } finally {
      setLoading(false);
    }
  }, [filter]);

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

  // Unique device list for device filter dropdown
  const deviceOptions = useMemo(() => {
    const ids = [...new Set(alarms.map((a) => a.deviceId))].sort();
    return ids;
  }, [alarms]);

  // Apply client-side filters
  const filtered = useMemo(() => {
    return alarms.filter((a) => {
      if (severity !== "all" && a.severity !== severity) return false;
      if (device !== "all" && a.deviceId !== device) return false;
      if (ackFilter === "acked"   && !a.acknowledgedAt) return false;
      if (ackFilter === "unacked" &&  a.acknowledgedAt) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          a.message.toLowerCase().includes(q) ||
          a.deviceId.toLowerCase().includes(q) ||
          (a.upsId ?? "").toLowerCase().includes(q) ||
          (a.upsName ?? "").toLowerCase().includes(q) ||
          (a.floor ?? "").toLowerCase().includes(q) ||
          (a.location ?? "").toLowerCase().includes(q) ||
          a.metric.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [alarms, severity, device, ackFilter, search]);

  const active   = alarms.filter((a) => a.state === "active");
  const critical = active.filter((a) => a.severity === "critical");
  const warning  = active.filter((a) => a.severity === "warning");

  const activeFilters = (severity !== "all" ? 1 : 0) + (device !== "all" ? 1 : 0) + (search.trim() ? 1 : 0) + (ackFilter !== "all" ? 1 : 0);

  function clearFilters() {
    setSeverity("all");
    setDevice("all");
    setSearch("");
    setAckFilter("all");
  }

  return (
    <AppShell activeNav="alarms">
      <div className="flex flex-col gap-4 sm:gap-5 max-w-4xl iot-page">

        {/* Header + state tabs */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Alarm Management</h1>
            <p className="text-sm text-slate-400">Monitor and acknowledge UPS alarm conditions.</p>
          </div>
          <nav className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide shrink-0">
            {(["active", "cleared", "all"] as FilterState[]).map((s) => (
              <button
                key={s}
                className={`rounded-md border px-3 py-1.5 text-sm font-semibold capitalize transition-colors whitespace-nowrap ${
                  filter === s
                    ? "border-cyan-700 bg-cyan-900/40 text-cyan-300"
                    : "border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
                onClick={() => setFilter(s)}
                type="button"
              >
                {s}
              </button>
            ))}
          </nav>
        </div>

        {/* Summary counters */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div
            className="rounded-lg border border-red-900/60 p-3 sm:p-4 cursor-pointer transition-all hover:border-red-700"
            style={{ background: "var(--surface-1)", boxShadow: critical.length ? "0 0 16px rgba(239,68,68,0.1)" : undefined }}
            onClick={() => { setSeverity(severity === "critical" ? "all" : "critical"); setFilter("active"); }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <AlertTriangle size={13} className={critical.length ? "text-red-400 iot-blink" : "text-slate-600"} />
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide">Critical</p>
            </div>
            <p className={`text-2xl sm:text-3xl font-bold ${critical.length ? "text-red-400" : "text-slate-500"}`}>{critical.length}</p>
            <p className="text-[10px] text-slate-600 mt-0.5">click to filter</p>
          </div>
          <div
            className="rounded-lg border border-amber-900/60 p-3 sm:p-4 cursor-pointer transition-all hover:border-amber-700"
            style={{ background: "var(--surface-1)" }}
            onClick={() => { setSeverity(severity === "warning" ? "all" : "warning"); setFilter("active"); }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <AlertTriangle size={13} className={warning.length ? "text-amber-400" : "text-slate-600"} />
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide">Warning</p>
            </div>
            <p className={`text-2xl sm:text-3xl font-bold ${warning.length ? "text-amber-400" : "text-slate-500"}`}>{warning.length}</p>
            <p className="text-[10px] text-slate-600 mt-0.5">click to filter</p>
          </div>
          <div
            className="rounded-lg border border-slate-700 p-3 sm:p-4"
            style={{ background: "var(--surface-1)" }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <Clock size={13} className="text-slate-500" />
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide">Showing</p>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-slate-300">{filtered.length}</p>
            <p className="text-[10px] text-slate-600 mt-0.5">of {alarms.length} total</p>
          </div>
        </div>

        {/* Filter bar */}
        <div
          className="rounded-lg border border-slate-700 p-3"
          style={{ background: "var(--surface-1)" }}
        >
          {/* Search + toggle row */}
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search message, device, metric, location…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-slate-600 bg-slate-900 pl-8 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500 transition-colors"
              />
              {search && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  onClick={() => setSearch("")}
                  type="button"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
                showFilters || activeFilters > 0
                  ? "border-cyan-700 bg-cyan-900/30 text-cyan-300"
                  : "border-slate-600 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <Filter size={13} />
              Filters
              {activeFilters > 0 && (
                <span className="rounded-full bg-cyan-600 text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                  {activeFilters}
                </span>
              )}
            </button>
            {activeFilters > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="flex items-center gap-1 rounded-md border border-slate-600 px-2.5 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              >
                <X size={12} /> Clear
              </button>
            )}
          </div>

          {/* Expanded filter row */}
          {showFilters && (
            <div className="mt-3 pt-3 border-t border-slate-700 flex flex-wrap gap-3">

              {/* Severity filter */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Severity</label>
                <div className="flex gap-1">
                  {(["all", "critical", "warning"] as FilterSeverity[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSeverity(s)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-semibold capitalize transition-colors ${
                        severity === s
                          ? s === "critical"
                            ? "border-red-700 bg-red-900/40 text-red-300"
                            : s === "warning"
                            ? "border-amber-700 bg-amber-900/40 text-amber-300"
                            : "border-cyan-700 bg-cyan-900/40 text-cyan-300"
                          : "border-slate-600 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Device filter */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Device</label>
                <select
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  className="rounded-md border border-slate-600 bg-slate-900 px-2.5 py-1 text-xs text-slate-100 outline-none focus:border-cyan-500 transition-colors"
                >
                  <option value="all">All devices</option>
                  {deviceOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Acknowledged filter */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Acknowledged</label>
                <div className="flex gap-1">
                  {(["all", "acked", "unacked"] as FilterAck[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAckFilter(v)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-semibold capitalize transition-colors ${
                        ackFilter === v
                          ? "border-cyan-700 bg-cyan-900/40 text-cyan-300"
                          : "border-slate-600 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      }`}
                    >
                      {v === "acked" ? "Yes" : v === "unacked" ? "No" : "All"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Alarm cards */}
        {loading ? (
          <div
            className="rounded-lg border border-slate-700 p-10 text-center text-sm text-slate-500 iot-shimmer"
            style={{ background: "var(--surface-1)" }}
          >
            Loading alarms…
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="flex flex-col items-center gap-3 rounded-lg border border-emerald-900/50 py-14 text-emerald-400"
            style={{ background: "var(--surface-1)" }}
          >
            <CheckCircle2 size={40} />
            <p className="font-semibold">
              {alarms.length === 0
                ? filter === "active" ? "No active alarms — all systems normal." : "No alarms found."
                : `No alarms match the current filters.`}
            </p>
            {activeFilters > 0 && (
              <button onClick={clearFilters} className="text-sm text-cyan-400 underline hover:text-cyan-300">
                Clear filters
              </button>
            )}
            <Link href="/" className="text-sm text-slate-500 underline hover:text-slate-300">
              Back to dashboard
            </Link>
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
