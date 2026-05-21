"use client";

import { Plus, Trash2, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface AlarmRule {
  id: string;
  metric: string;
  label: string;
  key: string;
  deviceId: string | null;
  upsUnitId: string | null;
  siteId: string | null;
  lowWarning: number | null;
  lowCritical: number | null;
  highWarning: number | null;
  highCritical: number | null;
  debounceSeconds: number;
  hysteresisPercent: number;
  enabled: boolean;
}

type Scope = "global" | "site" | "ups" | "device";

interface UpsListItem {
  id: string;
  upsId: string;
  name: string | null;
}

const SCOPE_LABELS: Record<Scope, string> = {
  global: "Global (all devices)",
  site: "Site",
  ups: "UPS unit",
  device: "Device",
};

const METRIC_OPTIONS = [
  { value: "volt_in", label: "Input Voltage" },
  { value: "volt_out", label: "Output Voltage" },
  { value: "volt_dc", label: "Battery Voltage" },
  { value: "ct_in", label: "Input Current" },
  { value: "ct_out", label: "Output Current" },
  { value: "s_out_va", label: "Output Apparent Power" },
  { value: "load_percent", label: "Load %" },
  { value: "offline", label: "Device Offline" },
];

function scopeOf(rule: AlarmRule): Scope {
  if (rule.deviceId) return "device";
  if (rule.upsUnitId) return "ups";
  if (rule.siteId) return "site";
  return "global";
}

function scopeId(rule: AlarmRule): string {
  return rule.deviceId ?? rule.upsUnitId ?? rule.siteId ?? "all";
}

const emptyForm = {
  metric: "volt_in",
  label: "Input Voltage",
  scope: "global" as Scope,
  scopeId: "",
  lowCritical: "",
  lowWarning: "",
  highWarning: "",
  highCritical: "",
  debounceSeconds: "30",
  hysteresisPercent: "2",
  enabled: true,
};

export default function AlarmRulesPage() {
  const [rules, setRules] = useState<AlarmRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [upsList, setUpsList] = useState<UpsListItem[]>([]);

  const [refreshTick, setRefreshTick] = useState(0);

  const load = () => setRefreshTick((t) => t + 1);

  useEffect(() => {
    fetch("/api/ups", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { units?: UpsListItem[] }) => setUpsList(data.units ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/alarm-rules", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { rules: AlarmRule[] }) => {
        if (!cancelled) setRules(data.rules);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load rules.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshTick]);

  const metricLabel = (m: string) => METRIC_OPTIONS.find((o) => o.value === m)?.label ?? m;

  function setMetric(value: string) {
    const label = METRIC_OPTIONS.find((o) => o.value === value)?.label ?? value;
    setForm((f) => ({ ...f, metric: value, label }));
  }

  async function createRule() {
    setSaving(true);
    setFormError("");
    const body: Record<string, unknown> = {
      metric: form.metric,
      label: form.label,
      enabled: form.enabled,
      debounceSeconds: Number(form.debounceSeconds) || 30,
      hysteresisPercent: Number(form.hysteresisPercent) || 2,
      deviceId: form.scope === "device" ? form.scopeId || null : null,
      upsUnitId: form.scope === "ups" ? form.scopeId || null : null,
      siteId: form.scope === "site" ? form.scopeId || null : null,
      lowCritical: form.lowCritical !== "" ? Number(form.lowCritical) : null,
      lowWarning: form.lowWarning !== "" ? Number(form.lowWarning) : null,
      highWarning: form.highWarning !== "" ? Number(form.highWarning) : null,
      highCritical: form.highCritical !== "" ? Number(form.highCritical) : null,
    };
    const res = await fetch("/api/alarm-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setFormError(data.error ?? "Failed to save.");
    } else {
      setShowForm(false);
      setForm(emptyForm);
      await load();
    }
    setSaving(false);
  }

  async function toggleEnabled(rule: AlarmRule) {
    await fetch(`/api/alarm-rules/${rule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    await load();
  }

  async function deleteRule(id: string) {
    if (!confirm("Delete this rule?")) return;
    await fetch(`/api/alarm-rules/${id}`, { method: "DELETE" });
    await load();
  }

  const fmt = (v: number | null) => (v !== null ? String(v) : "—");

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#eef3f8]"><p className="text-slate-500">Loading…</p></main>;

  return (
    <main className="min-h-screen bg-[#eef3f8] text-slate-950">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-semibold text-slate-500 hover:text-slate-800">← Dashboard</Link>
            <span className="text-slate-300">/</span>
            <div className="flex items-center gap-2">
              <Settings size={18} className="text-slate-500" />
              <h1 className="text-lg font-semibold">Alarm Rules</h1>
            </div>
          </div>
          <button
            className="flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={() => setShowForm((v) => !v)}
            type="button"
          >
            <Plus size={15} />
            Add rule
          </button>
        </header>

        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {showForm && (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold">New alarm rule</h2>
            {formError && <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{formError}</p>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-500">Metric</span>
                <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.metric} onChange={(e) => setMetric(e.target.value)}>
                  {METRIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-500">Label</span>
                <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-500">Scope</span>
                <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as Scope, scopeId: "" }))}>
                  {(Object.keys(SCOPE_LABELS) as Scope[]).map((s) => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}
                </select>
              </label>
              {form.scope !== "global" && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-500">{form.scope === "device" ? "Device ID" : form.scope === "ups" ? "UPS unit" : "Site ID"}</span>
                  {form.scope === "ups" ? (
                    <select
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={form.scopeId}
                      onChange={(e) => setForm((f) => ({ ...f, scopeId: e.target.value }))}
                    >
                      <option value="">— select UPS —</option>
                      {upsList.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.upsId}{u.name ? ` — ${u.name}` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={form.scopeId}
                      onChange={(e) => setForm((f) => ({ ...f, scopeId: e.target.value }))}
                      placeholder={form.scope === "device" ? "e.g. DEV-COM11-TEST" : "e.g. SITE-A"}
                    />
                  )}
                </label>
              )}
              {["lowCritical", "lowWarning", "highWarning", "highCritical"].map((field) => (
                <label key={field} className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-500">{field.replace(/([A-Z])/g, " $1").trim()}</span>
                  <input type="number" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form[field as keyof typeof form] as string} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} placeholder="leave blank to skip" />
                </label>
              ))}
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-500">Debounce (s)</span>
                <input type="number" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.debounceSeconds} onChange={(e) => setForm((f) => ({ ...f, debounceSeconds: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-500">Hysteresis (%)</span>
                <input type="number" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.hysteresisPercent} onChange={(e) => setForm((f) => ({ ...f, hysteresisPercent: e.target.value }))} />
              </label>
              <label className="flex items-center gap-2 text-sm pt-5">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
                <span>Enabled</span>
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={createRule} disabled={saving} type="button">
                {saving ? "Saving…" : "Save rule"}
              </button>
              <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => { setShowForm(false); setFormError(""); setForm(emptyForm); }} type="button">
                Cancel
              </button>
            </div>
          </section>
        )}

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          {rules.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No alarm rules defined. The alarm engine uses built-in defaults.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="px-4 py-3">Metric</th>
                    <th className="px-4 py-3">Label</th>
                    <th className="px-4 py-3">Scope</th>
                    <th className="px-4 py-3">Scope ID</th>
                    <th className="px-4 py-3">Low warn</th>
                    <th className="px-4 py-3">Low crit</th>
                    <th className="px-4 py-3">High warn</th>
                    <th className="px-4 py-3">High crit</th>
                    <th className="px-4 py-3">Debounce</th>
                    <th className="px-4 py-3">Enabled</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id} className={`border-b border-slate-100 ${!rule.enabled ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3 font-semibold">{metricLabel(rule.metric)}</td>
                      <td className="px-4 py-3 text-slate-600">{rule.label}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{scopeOf(rule)}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{scopeId(rule)}</td>
                      <td className="px-4 py-3">{fmt(rule.lowWarning)}</td>
                      <td className="px-4 py-3">{fmt(rule.lowCritical)}</td>
                      <td className="px-4 py-3">{fmt(rule.highWarning)}</td>
                      <td className="px-4 py-3">{fmt(rule.highCritical)}</td>
                      <td className="px-4 py-3">{rule.debounceSeconds}s</td>
                      <td className="px-4 py-3">
                        <button
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${rule.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                          onClick={() => toggleEnabled(rule)}
                          type="button"
                        >
                          {rule.enabled ? "Yes" : "No"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button className="text-red-500 hover:text-red-700" onClick={() => deleteRule(rule.id)} type="button" title="Delete">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold mb-1">Rule resolution priority</p>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>Device rule (highest priority)</li>
            <li>UPS unit rule</li>
            <li>Site rule</li>
            <li>Global rule</li>
            <li>Built-in defaults (lowest priority)</li>
          </ol>
          <p className="mt-2 text-slate-500">Only one rule applies per metric per device. DB rules override built-in defaults — they do not stack.</p>
        </div>
      </div>
    </main>
  );
}
