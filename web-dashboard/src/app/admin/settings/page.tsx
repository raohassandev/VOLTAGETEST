"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface SettingsPayload {
  settings: {
    rawRetentionDays: number;
    rollupRetentionMonths: number;
    alarmRetentionMonths: number;
  };
  offlineThresholdSecs?: number;
}

export default function SettingsAdminPage() {
  const [rawRetentionDays, setRawRetentionDays] = useState(30);
  const [rollupRetentionMonths, setRollupRetentionMonths] = useState(12);
  const [alarmRetentionMonths, setAlarmRetentionMonths] = useState(24);
  const [offlineThresholdSecs, setOfflineThresholdSecs] = useState(60);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
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
    <main className="min-h-screen bg-[#eef3f8] text-slate-950">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">
              <ShieldCheck size={18} />
            </Link>
            <div>
              <h1 className="text-2xl font-semibold">System Settings</h1>
              <p className="text-sm text-slate-500">Retention, alarm, and monitoring thresholds</p>
            </div>
          </div>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Data retention</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Raw telemetry (days)
              <input
                className="rounded-md border border-slate-300 px-3 py-2 font-normal"
                min={1} max={365} type="number"
                value={rawRetentionDays}
                onChange={(e) => setRawRetentionDays(Number(e.target.value))}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Rollup history (months)
              <input
                className="rounded-md border border-slate-300 px-3 py-2 font-normal"
                min={1} max={120} type="number"
                value={rollupRetentionMonths}
                onChange={(e) => setRollupRetentionMonths(Number(e.target.value))}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Alarm history (months)
              <input
                className="rounded-md border border-slate-300 px-3 py-2 font-normal"
                min={1} max={120} type="number"
                value={alarmRetentionMonths}
                onChange={(e) => setAlarmRetentionMonths(Number(e.target.value))}
              />
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Device monitoring</h2>
          <label className="grid max-w-xs gap-1 text-sm font-semibold text-slate-700">
            Offline threshold (seconds)
            <input
              className="rounded-md border border-slate-300 px-3 py-2 font-normal"
              min={10} max={3600} type="number"
              value={offlineThresholdSecs}
              onChange={(e) => setOfflineThresholdSecs(Number(e.target.value))}
            />
            <span className="text-xs font-normal text-slate-400">
              A device is marked offline if no telemetry is received for this many seconds.
            </span>
          </label>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-3 text-sm text-slate-500">
            <strong>Measurement limitations:</strong> Active power (W), power factor, and energy (kWh) fields
            are not computed. The firmware measures apparent power (VA) only via RMS voltage × RMS current.
            These fields are stored as null and shown as &ldquo;not supported&rdquo; in the UI until
            waveform-sampling firmware is validated and deployed.
          </p>
        </section>

        <div className="flex items-center gap-3">
          <button
            className="rounded-md bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            onClick={save}
            disabled={saving}
            type="button"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
          {msg && <span className="text-sm font-semibold text-emerald-700">{msg}</span>}
        </div>
      </div>
    </main>
  );
}
