"use client";

import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">
                <ShieldCheck size={18} />
              </Link>
              <div>
                <h1 className="text-2xl font-semibold">Alarm Management</h1>
                <p className="text-sm text-slate-500">Monitor and acknowledge UPS alarms</p>
              </div>
            </div>
            <nav className="flex gap-2">
              {(["active", "cleared", "all"] as FilterState[]).map((s) => (
                <button
                  key={s}
                  className={`rounded-md border px-3 py-1.5 text-sm font-semibold capitalize ${
                    filter === s ? "border-slate-950 bg-slate-950 text-white" : "border-slate-300 bg-white text-slate-700"
                  }`}
                  onClick={() => setFilter(s)}
                  type="button"
                >
                  {s}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-red-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">Critical</p>
            <p className="mt-1 text-3xl font-semibold text-red-700">{critical.length}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">Warning</p>
            <p className="mt-1 text-3xl font-semibold text-amber-700">{warning.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-500">Showing</p>
            <p className="mt-1 text-3xl font-semibold text-slate-950">{alarms.length}</p>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          {loading ? (
            <p className="text-sm text-slate-500">Loading alarms…</p>
          ) : alarms.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-emerald-700">
              <CheckCircle2 size={40} />
              <p className="font-semibold">
                {filter === "active" ? "No active alarms — all systems normal." : "No alarms found."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="py-2 pr-3">UPS</th>
                    <th className="py-2 pr-3">Device</th>
                    <th className="py-2 pr-3">Location</th>
                    <th className="py-2 pr-3">Metric</th>
                    <th className="py-2 pr-3">Severity</th>
                    <th className="py-2 pr-3">Message</th>
                    <th className="py-2 pr-3">First seen</th>
                    <th className="py-2 pr-3">State</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {alarms.map((alarm) => (
                    <>
                      <tr key={alarm.id} className="border-b border-slate-100">
                        <td className="py-2.5 pr-3 font-semibold">
                          {alarm.upsId ? (
                            <Link href={`/ups/${alarm.upsId}`} className="text-blue-700 hover:underline">
                              {alarm.upsId}
                            </Link>
                          ) : (
                            "--"
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-500">{alarm.deviceId}</td>
                        <td className="py-2.5 pr-3 text-slate-500">
                          {[alarm.floor, alarm.location].filter(Boolean).join(" / ") || "--"}
                        </td>
                        <td className="py-2.5 pr-3 font-mono">{alarm.metric}</td>
                        <td className="py-2.5 pr-3">
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
                        <td className="py-2.5 pr-3 text-slate-600">{alarm.message}</td>
                        <td className="py-2.5 pr-3 text-slate-400">{new Date(alarm.firstSeenAt).toLocaleString()}</td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              alarm.state === "active" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {alarm.state}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          {alarm.state === "active" && !alarm.acknowledgedAt ? (
                            <button
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              onClick={() => setAckingId(alarm.id === ackingId ? null : alarm.id)}
                              type="button"
                            >
                              <AlertTriangle size={12} className="mr-1 inline" />
                              Ack
                            </button>
                          ) : alarm.acknowledgedAt ? (
                            <span className="text-xs text-slate-400">Ack&apos;d {alarm.acknowledgedBy}</span>
                          ) : null}
                        </td>
                      </tr>
                      {ackingId === alarm.id && (
                        <tr className="bg-slate-50">
                          <td colSpan={9} className="px-3 pb-3 pt-1">
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
          )}
        </section>
      </div>
    </main>
  );
}
