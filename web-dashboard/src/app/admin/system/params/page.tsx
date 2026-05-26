"use client";

import { ArrowLeft, Save, Settings2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { checkUnauthorized } from "@/lib/handle-unauthorized";

interface SystemSettings {
  offlineThresholdSecs: number;
  rawRetentionDays: number;
  rollupRetentionMonths: number;
  alarmRetentionMonths: number;
}

const defaults: SystemSettings = {
  offlineThresholdSecs: 60,
  rawRetentionDays: 30,
  rollupRetentionMonths: 12,
  alarmRetentionMonths: 24,
};

function Field({
  label,
  description,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-3 py-4 border-b border-slate-800 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-200">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <div className="flex items-center gap-2 sm:w-48">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className="w-28 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-600 transition-colors text-right"
        />
        <span className="text-xs text-slate-500 whitespace-nowrap">{unit}</span>
      </div>
    </div>
  );
}

export default function SystemParamsPage() {
  const [settings, setSettings] = useState<SystemSettings>(defaults);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings", { credentials: "include" })
      .then((r) => {
        checkUnauthorized(r);
        return r.json();
      })
      .then((d) => {
        const s = d.settings as SystemSettings;
        setSettings({
          offlineThresholdSecs: d.offlineThresholdSecs ?? s.offlineThresholdSecs ?? defaults.offlineThresholdSecs,
          rawRetentionDays: s.rawRetentionDays ?? defaults.rawRetentionDays,
          rollupRetentionMonths: s.rollupRetentionMonths ?? defaults.rollupRetentionMonths,
          alarmRetentionMonths: s.alarmRetentionMonths ?? defaults.alarmRetentionMonths,
        });
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const r = await fetch("/api/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings, offlineThresholdSecs: settings.offlineThresholdSecs }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  function set(k: keyof SystemSettings, v: number) {
    setSettings((s) => ({ ...s, [k]: v }));
  }

  return (
    <AppShell activeNav="system">
      <div className="iot-page max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/admin/system" className="text-slate-400 hover:text-slate-200 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-2">
            <Settings2 size={18} className="text-slate-400" />
            <h1 className="text-xl font-bold text-white">System Parameters</h1>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <>
            {/* Connectivity */}
            <div className="iot-card rounded-xl border border-slate-700 p-5 mb-4">
              <h2 className="text-sm font-bold text-slate-300 mb-1">Connectivity</h2>
              <p className="text-xs text-slate-500 mb-3">How quickly a device is considered offline after its last telemetry message.</p>
              <Field
                label="Offline threshold"
                description="Device is marked offline if no telemetry received within this window. The worker checks every 30 s."
                value={settings.offlineThresholdSecs}
                min={10}
                max={3600}
                unit="seconds"
                onChange={(v) => set("offlineThresholdSecs", v)}
              />
            </div>

            {/* Retention */}
            <div className="iot-card rounded-xl border border-slate-700 p-5 mb-6">
              <h2 className="text-sm font-bold text-slate-300 mb-1">Data Retention</h2>
              <p className="text-xs text-slate-500 mb-3">Controls how long historical data is kept. Cleanup runs once per day.</p>
              <Field
                label="Raw telemetry retention"
                description="Individual telemetry rows (TelemetryRaw). High-frequency data — keep short to control DB size."
                value={settings.rawRetentionDays}
                min={1}
                max={365}
                unit="days"
                onChange={(v) => set("rawRetentionDays", v)}
              />
              <Field
                label="Rollup retention"
                description="Hourly/daily aggregated buckets (TelemetryRollup). Much smaller — can be kept longer."
                value={settings.rollupRetentionMonths}
                min={1}
                max={120}
                unit="months"
                onChange={(v) => set("rollupRetentionMonths", v)}
              />
              <Field
                label="Alarm history retention"
                description="Resolved alarm records (Alarm table). Cleared/auto-closed rows older than this are purged."
                value={settings.alarmRetentionMonths}
                min={1}
                max={120}
                unit="months"
                onChange={(v) => set("alarmRetentionMonths", v)}
              />
            </div>

            {error && (
              <p className="mb-4 rounded-md bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-300">{error}</p>
            )}
            {saved && (
              <p className="mb-4 rounded-md bg-emerald-900/30 border border-emerald-800 px-4 py-3 text-sm text-emerald-300">
                ✓ Settings saved
              </p>
            )}

            <div className="flex justify-end">
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 rounded-md bg-cyan-700 hover:bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
              >
                <Save size={15} />
                {saving ? "Saving…" : "Save Parameters"}
              </button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
