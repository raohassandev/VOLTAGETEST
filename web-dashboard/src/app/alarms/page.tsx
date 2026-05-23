"use client";

import { AlertTriangle, CheckCircle2, Clock, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
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

type FilterState = "active" | "cleared" | "all";

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
          {(alarm.floor || alarm.location) && (
            <span>{[alarm.floor, alarm.location].filter(Boolean).join(" / ")}</span>
          )}
          <span>First seen: {new Date(alarm.firstSeenAt).toLocaleString()}</span>
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
  const [alarms, setAlarms] = useState<AlarmRecord[]>([]);
  const [filter, setFilter] = useState<FilterState>("active");
  const [loading, setLoading] = useState(true);
  const [ackComment, setAckComment] = useState("");
  const [ackingId, setAckingId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole>("viewer");

  useEffect(() => {
    setUserRole(readRole()); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);
  const canAck = userRole !== "viewer";

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/alarms?state=${filter}&limit=200`, { cache: "no-store" });
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

  const active   = alarms.filter((a) => a.state === "active");
  const critical = active.filter((a) => a.severity === "critical");
  const warning  = active.filter((a) => a.severity === "warning");

  return (
    <AppShell activeNav="alarms">
      <div className="flex flex-col gap-4 sm:gap-5 max-w-4xl iot-page">

        {/* Header + filter */}
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
            className="rounded-lg border border-red-900/60 p-3 sm:p-4"
            style={{ background: "var(--surface-1)", boxShadow: critical.length ? "0 0 16px rgba(239,68,68,0.1)" : undefined }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <AlertTriangle size={13} className={critical.length ? "text-red-400 iot-blink" : "text-slate-600"} />
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide">Critical</p>
            </div>
            <p className={`text-2xl sm:text-3xl font-bold ${critical.length ? "text-red-400" : "text-slate-500"}`}>{critical.length}</p>
          </div>
          <div
            className="rounded-lg border border-amber-900/60 p-3 sm:p-4"
            style={{ background: "var(--surface-1)" }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <AlertTriangle size={13} className={warning.length ? "text-amber-400" : "text-slate-600"} />
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide">Warning</p>
            </div>
            <p className={`text-2xl sm:text-3xl font-bold ${warning.length ? "text-amber-400" : "text-slate-500"}`}>{warning.length}</p>
          </div>
          <div
            className="rounded-lg border border-slate-700 p-3 sm:p-4"
            style={{ background: "var(--surface-1)" }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <Clock size={13} className="text-slate-500" />
              <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</p>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-slate-300">{alarms.length}</p>
          </div>
        </div>

        {/* Alarm cards */}
        {loading ? (
          <div
            className="rounded-lg border border-slate-700 p-10 text-center text-sm text-slate-500 iot-shimmer"
            style={{ background: "var(--surface-1)" }}
          >
            Loading alarms…
          </div>
        ) : alarms.length === 0 ? (
          <div
            className="flex flex-col items-center gap-3 rounded-lg border border-emerald-900/50 py-14 text-emerald-400"
            style={{ background: "var(--surface-1)" }}
          >
            <CheckCircle2 size={40} />
            <p className="font-semibold">
              {filter === "active" ? "No active alarms — all systems normal." : "No alarms found."}
            </p>
            <Link href="/" className="text-sm text-slate-500 underline hover:text-slate-300">
              Back to dashboard
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {alarms.map((alarm) => (
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
