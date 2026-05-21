"use client";

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";

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

export default function AlarmsPage() {
  const [alarms, setAlarms] = useState<AlarmRecord[]>([]);
  const [filter, setFilter] = useState<FilterState>("active");
  const [loading, setLoading] = useState(true);
  const [ackComment, setAckComment] = useState("");
  const [ackingId, setAckingId] = useState<string | null>(null);

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
      body: JSON.stringify({ comment: ackComment, acknowledgedBy: "operator" }),
    });
    setAckingId(null);
    setAckComment("");
    load();
  }

  const active = alarms.filter((a) => a.state === "active");
  const critical = active.filter((a) => a.severity === "critical");
  const warning = active.filter((a) => a.severity === "warning");
  const cleared = alarms.filter((a) => a.state === "cleared");

  return (
    <AppShell activeNav="alarms">
      <div className="flex flex-col gap-5">

        {/* Page title + filter tabs */}
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

        {/* Summary cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-red-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-600" />
              <p className="text-sm font-semibold text-slate-500">Critical</p>
            </div>
            <p className="text-3xl font-bold text-red-700">{critical.length}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600" />
              <p className="text-sm font-semibold text-slate-500">Warning</p>
            </div>
            <p className="text-3xl font-bold text-amber-700">{warning.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <Clock size={16} className="text-slate-400" />
              <p className="text-sm font-semibold text-slate-500">
                {filter === "cleared" ? "Cleared" : "Showing"}
              </p>
            </div>
            <p className="text-3xl font-bold text-slate-950">{alarms.length}</p>
          </div>
        </div>

        {/* Alarm table */}
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading alarms…</div>
          ) : alarms.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-emerald-700">
              <CheckCircle2 size={40} />
              <p className="font-semibold">
                {filter === "active" ? "No active alarms — all systems normal." : "No alarms found."}
              </p>
              <Link href="/" className="text-sm text-slate-500 underline hover:text-slate-700">
                Back to dashboard
              </Link>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-3">UPS</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">Metric</th>
                      <th className="px-4 py-3">Severity</th>
                      <th className="px-4 py-3">Message</th>
                      <th className="px-4 py-3">First seen</th>
                      <th className="px-4 py-3">State</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alarms.map((alarm) => (
                      <>
                        <tr
                          key={alarm.id}
                          className={`border-b border-slate-100 ${
                            alarm.severity === "critical" && alarm.state === "active"
                              ? "bg-red-50/40"
                              : alarm.severity === "warning" && alarm.state === "active"
                              ? "bg-amber-50/40"
                              : ""
                          }`}
                        >
                          <td className="px-4 py-3 font-semibold">
                            {alarm.upsId ? (
                              <Link href={`/ups/${alarm.upsId}`} className="text-blue-700 hover:underline">
                                {alarm.upsId}
                              </Link>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {[alarm.floor, alarm.location].filter(Boolean).join(" / ") || "—"}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-700">{alarm.metric}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                alarm.severity === "critical"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {alarm.severity.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{alarm.message}</td>
                          <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                            {new Date(alarm.firstSeenAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                alarm.state === "active"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {alarm.state}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {alarm.state === "active" && !alarm.acknowledgedAt ? (
                              <button
                                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                onClick={() => setAckingId(alarm.id === ackingId ? null : alarm.id)}
                                type="button"
                              >
                                Ack
                              </button>
                            ) : alarm.acknowledgedAt ? (
                              <span className="text-xs text-slate-400">Ack&apos;d {alarm.acknowledgedBy}</span>
                            ) : null}
                          </td>
                        </tr>
                        {ackingId === alarm.id && (
                          <tr className="bg-slate-50">
                            <td colSpan={8} className="px-4 pb-3 pt-1">
                              <div className="flex items-center gap-3">
                                <input
                                  className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                                  placeholder="Optional comment…"
                                  value={ackComment}
                                  onChange={(e) => setAckComment(e.target.value)}
                                />
                                <button
                                  className="rounded-md bg-slate-950 px-3 py-1.5 text-sm font-semibold text-white"
                                  onClick={() => acknowledge(alarm.id)}
                                  type="button"
                                >
                                  Confirm
                                </button>
                                <button
                                  className="text-sm text-slate-500 hover:text-slate-700"
                                  onClick={() => setAckingId(null)}
                                  type="button"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: alarm cards */}
              <div className="flex flex-col divide-y divide-slate-100 md:hidden">
                {alarms.map((alarm) => (
                  <div
                    key={alarm.id}
                    className={`p-4 ${
                      alarm.severity === "critical" && alarm.state === "active" ? "bg-red-50/50" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            alarm.severity === "critical" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {alarm.severity.toUpperCase()}
                        </span>
                        <span className="ml-2 font-mono text-xs text-slate-500">{alarm.metric}</span>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          alarm.state === "active" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {alarm.state}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800">{alarm.message}</p>
                    {alarm.upsId && (
                      <Link href={`/ups/${alarm.upsId}`} className="mt-1 block text-xs text-blue-700 hover:underline">
                        {alarm.upsId}
                      </Link>
                    )}
                    <p className="mt-1 text-xs text-slate-400">{new Date(alarm.firstSeenAt).toLocaleString()}</p>
                    {alarm.state === "active" && !alarm.acknowledgedAt && (
                      <div className="mt-2">
                        {ackingId === alarm.id ? (
                          <div className="flex gap-2">
                            <input
                              className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                              placeholder="Comment…"
                              value={ackComment}
                              onChange={(e) => setAckComment(e.target.value)}
                            />
                            <button
                              className="rounded bg-slate-950 px-2 py-1 text-xs font-semibold text-white"
                              onClick={() => acknowledge(alarm.id)}
                              type="button"
                            >
                              Confirm
                            </button>
                            <button
                              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
                              onClick={() => setAckingId(null)}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                            onClick={() => setAckingId(alarm.id)}
                            type="button"
                          >
                            Acknowledge
                          </button>
                        )}
                      </div>
                    )}
                    {alarm.acknowledgedAt && (
                      <p className="mt-1 text-xs text-slate-400">Ack&apos;d by {alarm.acknowledgedBy}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Known limitation notice */}
        <p className="text-xs text-slate-400">
          <strong>Note:</strong> acknowledgedBy is currently hardcoded as &quot;operator&quot; — per-session user attribution is a P1 item.
        </p>

        {/* Cleared count info when viewing active */}
        {filter === "active" && cleared.length === 0 && alarms.length > 0 && (
          <p className="text-center text-xs text-slate-400">
            Showing active alarms only.{" "}
            <button className="underline" onClick={() => setFilter("cleared")} type="button">
              View cleared alarms
            </button>
          </p>
        )}
      </div>
    </AppShell>
  );
}
