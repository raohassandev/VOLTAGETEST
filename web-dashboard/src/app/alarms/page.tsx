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
  try { return (JSON.parse(atob(decodeURIComponent(m[1]))) as { role?: UserRole }).role ?? "viewer"; }
  catch { return "viewer"; }
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
      className={`rounded-lg border bg-white shadow-sm overflow-hidden ${
        isCritical && isActive ? "border-red-200" :
        !isCritical && isActive ? "border-amber-200" :
        "border-slate-200"
      }`}
    >
      {/* Top colour bar */}
      <div className={`h-1 w-full ${
        isCritical && isActive ? "bg-red-500" :
        !isCritical && isActive ? "bg-amber-400" :
        "bg-slate-200"
      }`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
              isCritical ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
            }`}>
              <AlertTriangle size={10} />
              {alarm.severity.toUpperCase()}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              isActive ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
            }`}>
              {alarm.state}
            </span>
            {alarm.metric && alarm.metric !== "offline" && (
              <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                {alarm.metric}
              </span>
            )}
          </div>
          {alarm.state === "active" && !alarm.acknowledgedAt && canAck && ackingId !== alarm.id && (
            <button
              className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              onClick={() => onAckOpen(alarm.id)}
              type="button"
            >
              Acknowledge
            </button>
          )}
        </div>

        {/* Message */}
        <p className="text-sm font-semibold text-slate-900 mb-2">{alarm.message}</p>

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {alarm.upsId && (
            <Link href={`/ups/${alarm.upsId}`} className="font-semibold text-blue-700 hover:underline">
              {alarm.upsId}
            </Link>
          )}
          {(alarm.floor || alarm.location) && (
            <span>{[alarm.floor, alarm.location].filter(Boolean).join(" / ")}</span>
          )}
          <span>First seen: {new Date(alarm.firstSeenAt).toLocaleString()}</span>
          {alarm.acknowledgedAt && (
            <span className="text-emerald-700">Ack&apos;d by {alarm.acknowledgedBy ?? "—"}</span>
          )}
          {alarm.comment && (
            <span className="italic text-slate-400">&quot;{alarm.comment}&quot;</span>
          )}
        </div>

        {/* Ack inline form */}
        {ackingId === alarm.id && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            <input
              className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
              placeholder="Optional comment…"
              value={ackComment}
              onChange={(e) => onAckCommentChange(e.target.value)}
              autoFocus
            />
            <button
              className="rounded-md bg-slate-950 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={() => onAckConfirm(alarm.id)}
              type="button"
            >
              Confirm
            </button>
            <button
              className="rounded-md border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-100"
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

  useEffect(() => { setUserRole(readRole()); }, []);
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
      body: JSON.stringify({ comment: ackComment, acknowledgedBy: userRole }),
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
      <div className="flex flex-col gap-5 max-w-4xl">

        {/* Header + filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Alarm Management</h1>
            <p className="text-sm text-slate-500">Monitor and acknowledge UPS alarm conditions.</p>
          </div>
          <nav className="flex gap-1.5">
            {(["active", "cleared", "all"] as FilterState[]).map((s) => (
              <button
                key={s}
                className={`rounded-md border px-3 py-1.5 text-sm font-semibold capitalize transition-colors ${
                  filter === s
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
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
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-red-200 bg-white p-4 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <AlertTriangle size={15} className="text-red-600" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Critical</p>
            </div>
            <p className="text-3xl font-bold text-red-700">{critical.length}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-white p-4 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Warning</p>
            </div>
            <p className="text-3xl font-bold text-amber-600">{warning.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <Clock size={15} className="text-slate-400" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total shown</p>
            </div>
            <p className="text-3xl font-bold text-slate-950">{alarms.length}</p>
          </div>
        </div>

        {/* Alarm cards */}
        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-400 shadow-sm">
            Loading alarms…
          </div>
        ) : alarms.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white py-14 shadow-sm text-emerald-700">
            <CheckCircle2 size={40} />
            <p className="font-semibold">
              {filter === "active" ? "No active alarms — all systems normal." : "No alarms found."}
            </p>
            <Link href="/" className="text-sm text-slate-500 underline hover:text-slate-700">
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
