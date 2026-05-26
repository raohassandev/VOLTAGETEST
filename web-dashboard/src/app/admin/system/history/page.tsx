"use client";

import { ArrowLeft, History, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { checkUnauthorized } from "@/lib/handle-unauthorized";

interface Stats {
  rawCount: number;
  rollupCount: number;
  alarmCount: number;
  oldestRaw: string | null;
  oldestRollup: string | null;
}

interface Settings {
  rawRetentionDays: number;
  rollupRetentionMonths: number;
  alarmRetentionMonths: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function HistoryPage() {
  const [stats, setStats]       = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [purging, setPurging]   = useState(false);
  const [purged, setPurged]     = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [sr, ss] = await Promise.all([
        fetch("/api/system/stats", { credentials: "include" }).then((r) => {
          checkUnauthorized(r);
          return r.json();
        }),
        fetch("/api/settings", { credentials: "include" }).then((r) => r.json()),
      ]);
      setStats({
        rawCount: sr.rawCount ?? 0,
        rollupCount: sr.rollupCount ?? 0,
        alarmCount: sr.alarmCount ?? 0,
        oldestRaw: sr.oldestRaw ?? null,
        oldestRollup: sr.oldestRollup ?? null,
      });
      setSettings({
        rawRetentionDays: ss.settings?.rawRetentionDays ?? 30,
        rollupRetentionMonths: ss.settings?.rollupRetentionMonths ?? 12,
        alarmRetentionMonths: ss.settings?.alarmRetentionMonths ?? 24,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadAll(); }, []);

  async function triggerPurge() {
    if (!confirm("This will delete raw telemetry and rollup rows older than the configured retention period. Continue?")) return;
    setPurging(true);
    setPurged(null);
    setError(null);
    try {
      const r = await fetch("/api/system/purge", { method: "POST", credentials: "include" });
      checkUnauthorized(r);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json() as { deleted: { raw: number; rollup: number; alarms: number } };
      setPurged(`Purged: ${fmt(d.deleted.raw)} raw rows, ${fmt(d.deleted.rollup)} rollup rows, ${fmt(d.deleted.alarms)} alarm rows.`);
      await loadAll();
    } catch (e) {
      setError(String(e));
    } finally {
      setPurging(false);
    }
  }

  return (
    <AppShell activeNav="system">
      <div className="iot-page max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/admin/system" className="text-slate-400 hover:text-slate-200 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-2">
            <History size={18} className="text-cyan-400" />
            <h1 className="text-xl font-bold text-white">History Control</h1>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <>
            {/* Current retention settings summary */}
            {settings && (
              <div className="iot-card rounded-xl border border-slate-700 p-5 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-slate-300">Active Retention Policy</h2>
                  <Link href="/admin/system/params" className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                    Edit →
                  </Link>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Raw data", value: `${settings.rawRetentionDays}d` },
                    { label: "Rollup data", value: `${settings.rollupRetentionMonths}mo` },
                    { label: "Alarm history", value: `${settings.alarmRetentionMonths}mo` },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg bg-slate-800/60 border border-slate-700 p-3 text-center">
                      <p className="text-lg font-bold text-white">{item.value}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Row counts */}
            {stats && (
              <div className="iot-card rounded-xl border border-slate-700 p-5 mb-4">
                <h2 className="text-sm font-bold text-slate-300 mb-3">Database Row Counts</h2>
                <div className="space-y-2">
                  {[
                    {
                      label: "Raw telemetry (TelemetryRaw)",
                      count: stats.rawCount,
                      oldest: stats.oldestRaw,
                      color: "text-amber-300",
                    },
                    {
                      label: "Rollup buckets (TelemetryRollup)",
                      count: stats.rollupCount,
                      oldest: stats.oldestRollup,
                      color: "text-cyan-300",
                    },
                    {
                      label: "Alarm records (Alarm)",
                      count: stats.alarmCount,
                      oldest: null,
                      color: "text-red-300",
                    },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                      <div>
                        <p className="text-sm text-slate-300">{row.label}</p>
                        {row.oldest && (
                          <p className="text-xs text-slate-600 mt-0.5">
                            Oldest: {new Date(row.oldest).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <span className={`text-lg font-bold font-mono ${row.color}`}>
                        {fmt(row.count)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p className="mb-4 rounded-md bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-300">{error}</p>
            )}
            {purged && (
              <p className="mb-4 rounded-md bg-emerald-900/30 border border-emerald-800 px-4 py-3 text-sm text-emerald-300">
                ✓ {purged}
              </p>
            )}

            {/* Manual purge */}
            <div className="iot-card rounded-xl border border-red-900/50 bg-red-950/10 p-5">
              <h2 className="text-sm font-bold text-red-400 mb-1">Manual Purge</h2>
              <p className="text-xs text-slate-500 mb-4">
                Immediately delete all rows older than the current retention policy. The worker also runs this automatically once per day.
              </p>
              <button
                onClick={triggerPurge}
                disabled={purging}
                className="flex items-center gap-2 rounded-md bg-red-800 hover:bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
              >
                <Trash2 size={14} />
                {purging ? "Purging…" : "Run Purge Now"}
              </button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
