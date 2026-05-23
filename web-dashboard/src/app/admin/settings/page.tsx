"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { checkUnauthorized } from "@/lib/handle-unauthorized";

interface SettingsPayload {
  settings: {
    rawRetentionDays: number;
    rollupRetentionMonths: number;
    alarmRetentionMonths: number;
  };
  offlineThresholdSecs?: number;
}

const inputCls  = "rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-600 transition-colors font-normal";
const inputStyle = { background: "var(--surface-2)" };

export default function SettingsAdminPage() {
  const [rawRetentionDays,      setRawRetentionDays]      = useState(30);
  const [rollupRetentionMonths, setRollupRetentionMonths] = useState(12);
  const [alarmRetentionMonths,  setAlarmRetentionMonths]  = useState(24);
  const [offlineThresholdSecs,  setOfflineThresholdSecs]  = useState(60);
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState("");

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => { if (checkUnauthorized(r)) throw new Error("401"); return r.json(); })
      .then((d: SettingsPayload) => {
        if (d.settings) {
          setRawRetentionDays(d.settings.rawRetentionDays);
          setRollupRetentionMonths(d.settings.rollupRetentionMonths);
          setAlarmRetentionMonths(d.settings.alarmRetentionMonths);
        }
        if (d.offlineThresholdSecs) setOfflineThresholdSecs(d.offlineThresholdSecs);
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { rawRetentionDays, rollupRetentionMonths, alarmRetentionMonths },
          offlineThresholdSecs,
        }),
      });
      if (res.ok) setMsg("Settings saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell activeNav="settings">
      <div className="flex max-w-3xl flex-col gap-5 iot-page">
        <div>
          <h1 className="text-2xl font-bold text-white">System Settings</h1>
          <p className="text-sm text-slate-400">Retention, alarm, and monitoring thresholds.</p>
        </div>

        <section className="rounded-lg border border-slate-700 p-5" style={{ background: "var(--surface-1)" }}>
          <h2 className="mb-4 text-lg font-semibold text-white">Data retention</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-sm font-semibold text-slate-400">
              Raw telemetry (days)
              <input
                className={inputCls} style={inputStyle}
                min={1} max={365} type="number"
                value={rawRetentionDays}
                onChange={(e) => setRawRetentionDays(Number(e.target.value))}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-400">
              Rollup history (months)
              <input
                className={inputCls} style={inputStyle}
                min={1} max={120} type="number"
                value={rollupRetentionMonths}
                onChange={(e) => setRollupRetentionMonths(Number(e.target.value))}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-400">
              Alarm history (months)
              <input
                className={inputCls} style={inputStyle}
                min={1} max={120} type="number"
                value={alarmRetentionMonths}
                onChange={(e) => setAlarmRetentionMonths(Number(e.target.value))}
              />
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-slate-700 p-5" style={{ background: "var(--surface-1)" }}>
          <h2 className="mb-4 text-lg font-semibold text-white">Device monitoring</h2>
          <label className="grid max-w-xs gap-1 text-sm font-semibold text-slate-400">
            Offline threshold (seconds)
            <input
              className={inputCls} style={inputStyle}
              min={10} max={3600} type="number"
              value={offlineThresholdSecs}
              onChange={(e) => setOfflineThresholdSecs(Number(e.target.value))}
            />
            <span className="text-xs font-normal text-slate-600">
              A device is marked offline if no telemetry is received for this many seconds.
            </span>
          </label>
        </section>

        <section className="rounded-lg border border-slate-700 p-4" style={{ background: "var(--surface-2)" }}>
          <p className="text-sm text-slate-500">
            <strong className="text-slate-400">Measurement limitations:</strong> Active power (W), power factor, and energy (kWh) fields
            are not computed. The firmware measures apparent power (VA) only via RMS voltage × RMS current.
            These fields are stored as null and shown as &ldquo;not supported&rdquo; in the UI until
            waveform-sampling firmware is validated and deployed.
          </p>
        </section>

        <div className="flex items-center gap-3">
          <button
            className="rounded-md bg-cyan-700 hover:bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
            onClick={save}
            disabled={saving}
            type="button"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
          {msg && <span className="text-sm font-semibold text-emerald-400">{msg}</span>}
        </div>
      </div>
    </AppShell>
  );
}
