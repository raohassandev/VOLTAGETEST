"use client";

import { FlaskConical, RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { checkUnauthorized } from "@/lib/handle-unauthorized";

interface Device {
  deviceId: string;
  upsId: string | null;
  firmware: string | null;
  online: boolean;
}

interface CalibProfile {
  vInScale: number; vInOffset: number;
  vOutScale: number; vOutOffset: number;
  vDcScale: number; vDcOffset: number;
  iInScale: number; iInOffset: number;
  iOutScale: number; iOutOffset: number;
}

const DEFAULT_PROFILE: CalibProfile = {
  vInScale: 1,   vInOffset: 0,
  vOutScale: 1,  vOutOffset: 0,
  vDcScale: 0.0442, vDcOffset: 0,
  iInScale: 1,   iInOffset: 0,
  iOutScale: 1,  iOutOffset: 0,
};

const CHANNELS: { key: keyof CalibProfile; label: string; scaleKey: keyof CalibProfile; offsetKey: keyof CalibProfile }[] = [
  { key: "vInScale",  label: "Input Voltage (V_in)",    scaleKey: "vInScale",  offsetKey: "vInOffset"  },
  { key: "vOutScale", label: "Output Voltage (V_out)",  scaleKey: "vOutScale", offsetKey: "vOutOffset" },
  { key: "vDcScale",  label: "Battery Voltage (V_dc)",  scaleKey: "vDcScale",  offsetKey: "vDcOffset"  },
  { key: "iInScale",  label: "Input Current (I_in)",    scaleKey: "iInScale",  offsetKey: "iInOffset"  },
  { key: "iOutScale", label: "Output Current (I_out)",  scaleKey: "iOutScale", offsetKey: "iOutOffset" },
];

function profileToForm(p: Partial<CalibProfile>): Record<string, string> {
  const merged = { ...DEFAULT_PROFILE, ...p };
  return Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, String(v)]));
}

function formToProfile(f: Record<string, string>): CalibProfile {
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, parseFloat(v) || 0])) as unknown as CalibProfile;
}

const numInputCls = "rounded border border-slate-600 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-600 transition-colors";
const numInputStyle = { background: "var(--surface-1)" };

export default function CalibrationPage() {
  const [devices,    setDevices]    = useState<Device[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState<string | null>(null);
  const [form,       setForm]       = useState<Record<string, string>>(profileToForm(DEFAULT_PROFILE));
  const [hasProfile, setHasProfile] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [msg,        setMsg]        = useState("");
  const [error,      setError]      = useState("");

  useEffect(() => {
    fetch("/api/devices", { cache: "no-store" })
      .then((r) => { if (checkUnauthorized(r)) throw new Error("401"); return r.json(); })
      .then((d: { devices?: Device[] }) => setDevices(d.devices ?? []))
      .catch((e) => { if ((e as Error).message !== "401") setError("Could not load devices."); })
      .finally(() => setLoading(false));
  }, []);

  async function selectDevice(deviceId: string) {
    setSelected(deviceId);
    setMsg("");
    const res = await fetch(`/api/calibration/${deviceId}`, { cache: "no-store" });
    const data = (await res.json()) as { profile?: CalibProfile | null };
    if (data.profile) {
      setForm(profileToForm(data.profile));
      setHasProfile(true);
    } else {
      setForm(profileToForm(DEFAULT_PROFILE));
      setHasProfile(false);
    }
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setMsg("");
    const res = await fetch(`/api/calibration/${selected}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formToProfile(form)),
    });
    if (res.ok) { setMsg("Saved."); setHasProfile(true); }
    else { setMsg("Save failed."); }
    setSaving(false);
  }

  async function resetToDefault() {
    if (!selected) return;
    if (!confirm("Reset to default calibration values?")) return;
    setForm(profileToForm(DEFAULT_PROFILE));
    if (hasProfile) {
      await fetch(`/api/calibration/${selected}`, { method: "DELETE" });
      setHasProfile(false);
      setMsg("Reset to defaults.");
    }
  }

  const selectedDevice = devices.find((d) => d.deviceId === selected);

  return (
    <AppShell activeNav="calibration">
      <div className="flex max-w-5xl flex-col gap-5 iot-page">
        <div className="flex items-center gap-2">
          <FlaskConical size={18} className="text-amber-400" />
          <h1 className="text-2xl font-bold text-white">Calibration Profiles</h1>
        </div>

        {error && <p className="rounded-md bg-red-900/30 border border-red-800 p-3 text-sm text-red-400">{error}</p>}

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Device list */}
          <section className="rounded-lg border border-slate-700 lg:col-span-1" style={{ background: "var(--surface-1)" }}>
            <div className="border-b border-slate-700 px-4 py-3">
              <p className="text-sm font-semibold text-slate-300">Select device</p>
            </div>
            {loading ? (
              <p className="p-4 text-sm text-slate-500">Loading…</p>
            ) : devices.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No devices found.</p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {devices.map((d) => (
                  <li key={d.deviceId}>
                    <button
                      onClick={() => selectDevice(d.deviceId)}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        selected === d.deviceId
                          ? "bg-cyan-900/40 border-l-2 border-cyan-500"
                          : "hover:bg-slate-800/60"
                      }`}
                      type="button"
                    >
                      <p className={`text-sm font-semibold truncate ${selected === d.deviceId ? "text-cyan-300" : "text-slate-200"}`}>
                        {d.deviceId}
                      </p>
                      <p className={`text-xs truncate ${selected === d.deviceId ? "text-cyan-500" : "text-slate-500"}`}>
                        {d.upsId ?? "No UPS"} · {d.online ? "Online" : "Offline"}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Calibration form */}
          <section className="rounded-lg border border-slate-700 lg:col-span-2" style={{ background: "var(--surface-1)" }}>
            {!selected ? (
              <div className="flex h-64 items-center justify-center text-slate-500">
                <p className="text-sm">Select a device to view or edit its calibration profile.</p>
              </div>
            ) : (
              <div className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-white">{selected}</p>
                    <p className="text-xs text-slate-500">
                      {hasProfile ? "Custom profile active" : "Using default values"} · firmware: {selectedDevice?.firmware ?? "unknown"}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${hasProfile ? "bg-cyan-900/40 border border-cyan-800 text-cyan-300" : "bg-slate-700 border border-slate-600 text-slate-400"}`}>
                    {hasProfile ? "Custom" : "Default"}
                  </span>
                </div>

                <p className="mb-4 text-xs text-slate-500">
                  Applied value = (raw × scale) + offset. Default V_dc scale is 0.0442 (12-bit ADC to volts).
                </p>

                <div className="space-y-4">
                  {CHANNELS.map((ch) => (
                    <div key={ch.label} className="rounded-md border border-slate-700 p-3" style={{ background: "var(--surface-2)" }}>
                      <p className="mb-2 text-xs font-semibold text-slate-400">{ch.label}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="text-slate-500">Scale (multiplier)</span>
                          <input
                            type="number" step="any"
                            className={numInputCls} style={numInputStyle}
                            value={form[ch.scaleKey]}
                            onChange={(e) => setForm((f) => ({ ...f, [ch.scaleKey]: e.target.value }))}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                          <span className="text-slate-500">Offset (additive)</span>
                          <input
                            type="number" step="any"
                            className={numInputCls} style={numInputStyle}
                            value={form[ch.offsetKey]}
                            onChange={(e) => setForm((f) => ({ ...f, [ch.offsetKey]: e.target.value }))}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <button
                    className="flex items-center gap-2 rounded-md bg-cyan-700 hover:bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                    onClick={save}
                    disabled={saving}
                    type="button"
                  >
                    <Save size={14} />
                    {saving ? "Saving…" : "Save profile"}
                  </button>
                  <button
                    className="flex items-center gap-2 rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                    onClick={resetToDefault}
                    type="button"
                  >
                    <RotateCcw size={14} />
                    Reset to defaults
                  </button>
                  {msg && <span className={`text-sm font-semibold ${msg.includes("fail") ? "text-red-400" : "text-emerald-400"}`}>{msg}</span>}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
