"use client";

import { Plus, Trash2, Settings, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { checkUnauthorized } from "@/lib/handle-unauthorized";

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
  { value: "volt_in",       label: "Input Voltage" },
  { value: "volt_out",      label: "Output Voltage" },
  { value: "volt_dc",       label: "Battery Voltage" },
  { value: "ct_in",         label: "Input Current" },
  { value: "ct_out",        label: "Output Current" },
  { value: "s_out_va",      label: "Output Apparent Power" },
  { value: "load_percent",  label: "Load %" },
  { value: "p_in_w",        label: "Input Real Power (W)" },
  { value: "p_out_w",       label: "Output Real Power (W)" },
  { value: "pf_in",         label: "Input Power Factor" },
  { value: "pf_out",        label: "Output Power Factor" },
  { value: "freq_in",       label: "Input Frequency (Hz)" },
  { value: "freq_out",      label: "Output Frequency (Hz)" },
  { value: "q_in_var",      label: "Input Reactive Power (VAR)" },
  { value: "q_out_var",     label: "Output Reactive Power (VAR)" },
  { value: "e_in_kwh",      label: "Input Energy (kWh)" },
  { value: "e_out_kwh",     label: "Output Energy (kWh)" },
  { value: "offline",       label: "Device Offline" },
];

function scopeOf(rule: AlarmRule): Scope {
  if (rule.deviceId)  return "device";
  if (rule.upsUnitId) return "ups";
  if (rule.siteId)    return "site";
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

const inputCls  = "rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-600 transition-colors";
const inputStyle = { background: "var(--surface-2)" };
const selectCls = "rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-600 transition-colors";

export default function AlarmRulesPage() {
  const [rules, setRules]       = useState<AlarmRule[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(emptyForm);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState("");
  const [upsList, setUpsList]   = useState<UpsListItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const load = () => setRefreshTick((t) => t + 1);

  useEffect(() => {
    fetch("/api/ups", { cache: "no-store" })
      .then((r) => { if (checkUnauthorized(r)) throw new Error("401"); return r.json(); })
      .then((data: { units?: UpsListItem[] }) => setUpsList(data.units ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/alarm-rules", { cache: "no-store" })
      .then((res) => { if (checkUnauthorized(res)) throw new Error("401"); return res.json(); })
      .then((data: { rules: AlarmRule[] }) => { if (!cancelled) setRules(data.rules); })
      .catch((e) => { if (!cancelled && (e as Error).message !== "401") setError("Could not load rules."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshTick]);

  const metricLabel = (m: string) => METRIC_OPTIONS.find((o) => o.value === m)?.label ?? m;

  function setMetric(value: string) {
    const label = METRIC_OPTIONS.find((o) => o.value === value)?.label ?? value;
    setForm((f) => ({ ...f, metric: value, label }));
  }

  function openEdit(rule: AlarmRule) {
    setEditingId(rule.id);
    setForm({
      metric: rule.metric,
      label: rule.label,
      scope: scopeOf(rule),
      scopeId: rule.deviceId ?? rule.upsUnitId ?? rule.siteId ?? "",
      lowCritical: rule.lowCritical !== null ? String(rule.lowCritical) : "",
      lowWarning: rule.lowWarning !== null ? String(rule.lowWarning) : "",
      highWarning: rule.highWarning !== null ? String(rule.highWarning) : "",
      highCritical: rule.highCritical !== null ? String(rule.highCritical) : "",
      debounceSeconds: String(rule.debounceSeconds),
      hysteresisPercent: String(rule.hysteresisPercent),
      enabled: rule.enabled,
    });
    setFormError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError("");
    setForm(emptyForm);
  }

  async function saveRule() {
    setSaving(true);
    setFormError("");
    const thresholds = {
      lowCritical:  form.lowCritical  !== "" ? Number(form.lowCritical)  : null,
      lowWarning:   form.lowWarning   !== "" ? Number(form.lowWarning)   : null,
      highWarning:  form.highWarning  !== "" ? Number(form.highWarning)  : null,
      highCritical: form.highCritical !== "" ? Number(form.highCritical) : null,
    };

    let res: Response;
    if (editingId) {
      res = await fetch(`/api/alarm-rules/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: form.label, enabled: form.enabled, debounceSeconds: Number(form.debounceSeconds) || 30, hysteresisPercent: Number(form.hysteresisPercent) || 2, ...thresholds }),
      });
    } else {
      res = await fetch("/api/alarm-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metric: form.metric, label: form.label, enabled: form.enabled, debounceSeconds: Number(form.debounceSeconds) || 30, hysteresisPercent: Number(form.hysteresisPercent) || 2, deviceId: form.scope === "device" ? form.scopeId || null : null, upsUnitId: form.scope === "ups" ? form.scopeId || null : null, siteId: form.scope === "site" ? form.scopeId || null : null, ...thresholds }),
      });
    }

    const data = (await res.json()) as { error?: string };
    if (!res.ok) { setFormError(data.error ?? "Failed to save."); }
    else { closeForm(); load(); }
    setSaving(false);
  }

  async function toggleEnabled(rule: AlarmRule) {
    await fetch(`/api/alarm-rules/${rule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    load();
  }

  async function deleteRule(id: string) {
    if (!confirm("Delete this rule?")) return;
    await fetch(`/api/alarm-rules/${id}`, { method: "DELETE" });
    load();
  }

  const fmt = (v: number | null) => (v !== null ? String(v) : "—");

  if (loading) {
    return (
      <AppShell activeNav="alarm-rules">
        <div className="flex h-40 items-center justify-center text-slate-500">Loading…</div>
      </AppShell>
    );
  }

  return (
    <AppShell activeNav="alarm-rules">
      <div className="flex max-w-5xl flex-col gap-5 iot-page">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-slate-500" />
            <h1 className="text-2xl font-bold text-white">Alarm Rules</h1>
          </div>
          <button
            className="flex items-center gap-2 rounded-md bg-cyan-700 hover:bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors"
            onClick={() => { setEditingId(null); setForm(emptyForm); setFormError(""); setShowForm((v) => !v); }}
            type="button"
          >
            <Plus size={15} />
            Add rule
          </button>
        </div>

        {error && <p className="rounded-md bg-red-900/30 border border-red-800 p-3 text-sm text-red-400">{error}</p>}

        {showForm && (
          <section className="rounded-lg border border-slate-700 p-5" style={{ background: "var(--surface-1)" }}>
            <h2 className="mb-4 text-sm font-semibold text-white">{editingId ? "Edit alarm rule" : "New alarm rule"}</h2>
            {editingId && (
              <p className="mb-3 rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-400" style={{ background: "var(--surface-2)" }}>
                Editing: <span className="font-semibold text-slate-200">{metricLabel(form.metric)}</span> — scope: <span className="font-semibold text-slate-200">{SCOPE_LABELS[form.scope]}{form.scopeId ? ` (${form.scopeId})` : ""}</span>. Metric and scope cannot be changed; delete and recreate to change them.
              </p>
            )}
            {formError && <p className="mb-3 rounded-md bg-red-900/30 border border-red-800 p-2 text-sm text-red-400">{formError}</p>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {!editingId && (
                <>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-slate-400">Metric</span>
                    <select className={selectCls} style={inputStyle} value={form.metric} onChange={(e) => setMetric(e.target.value)}>
                      {METRIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-slate-400">Scope</span>
                    <select className={selectCls} style={inputStyle} value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as Scope, scopeId: "" }))}>
                      {(Object.keys(SCOPE_LABELS) as Scope[]).map((s) => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}
                    </select>
                  </label>
                  {form.scope !== "global" && (
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-slate-400">{form.scope === "device" ? "Device ID" : form.scope === "ups" ? "UPS unit" : "Site ID"}</span>
                      {form.scope === "ups" ? (
                        <select className={selectCls} style={inputStyle} value={form.scopeId} onChange={(e) => setForm((f) => ({ ...f, scopeId: e.target.value }))}>
                          <option value="">— select UPS —</option>
                          {upsList.map((u) => <option key={u.id} value={u.id}>{u.upsId}{u.name ? ` — ${u.name}` : ""}</option>)}
                        </select>
                      ) : (
                        <input className={inputCls} style={inputStyle} value={form.scopeId} onChange={(e) => setForm((f) => ({ ...f, scopeId: e.target.value }))} placeholder={form.scope === "device" ? "e.g. DEV-COM11-TEST" : "e.g. SITE-A"} />
                      )}
                    </label>
                  )}
                </>
              )}
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-400">Label</span>
                <input className={inputCls} style={inputStyle} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
              </label>
              {["lowCritical", "lowWarning", "highWarning", "highCritical"].map((field) => (
                <label key={field} className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-400">{field.replace(/([A-Z])/g, " $1").trim()}</span>
                  <input type="number" className={inputCls} style={inputStyle} value={form[field as keyof typeof form] as string} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} placeholder="leave blank to skip" />
                </label>
              ))}
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-400">Debounce (s)</span>
                <input type="number" className={inputCls} style={inputStyle} value={form.debounceSeconds} onChange={(e) => setForm((f) => ({ ...f, debounceSeconds: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-400">Hysteresis (%)</span>
                <input type="number" className={inputCls} style={inputStyle} value={form.hysteresisPercent} onChange={(e) => setForm((f) => ({ ...f, hysteresisPercent: e.target.value }))} />
              </label>
              <label className="flex items-center gap-2 text-sm pt-5 text-slate-300">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} className="accent-cyan-500" />
                <span>Enabled</span>
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="rounded-md bg-cyan-700 hover:bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors" onClick={saveRule} disabled={saving} type="button">
                {saving ? "Saving…" : editingId ? "Update rule" : "Save rule"}
              </button>
              <button className="rounded-md border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors" onClick={closeForm} type="button">
                Cancel
              </button>
            </div>
          </section>
        )}

        <section className="rounded-lg border border-slate-700" style={{ background: "var(--surface-1)" }}>
          {rules.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No alarm rules defined. The alarm engine uses built-in defaults.</p>
          ) : (
            <>
              {/* Mobile card list */}
              <div className="divide-y divide-slate-800 sm:hidden">
                {rules.map((rule) => (
                  <div key={rule.id} className={`p-4 flex flex-col gap-2 ${!rule.enabled ? "opacity-40" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-100">{metricLabel(rule.metric)}</p>
                        <p className="text-xs text-slate-500">{rule.label}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${rule.enabled ? "bg-emerald-900/40 border border-emerald-800 text-emerald-400" : "bg-slate-700 border border-slate-600 text-slate-400"}`}
                          onClick={() => toggleEnabled(rule)} type="button"
                        >{rule.enabled ? "On" : "Off"}</button>
                        <button className="text-slate-500 hover:text-slate-300 transition-colors" onClick={() => openEdit(rule)} type="button"><Pencil size={13} /></button>
                        <button className="text-red-600 hover:text-red-400 transition-colors" onClick={() => deleteRule(rule.id)} type="button"><Trash2 size={13} /></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span className="text-slate-500">Scope</span>
                      <span className="text-slate-300 font-semibold">{scopeOf(rule)} {scopeId(rule) !== "all" ? `· ${scopeId(rule)}` : ""}</span>
                      <span className="text-slate-500">Low warn / crit</span>
                      <span className="text-slate-300">{fmt(rule.lowWarning)} / {fmt(rule.lowCritical)}</span>
                      <span className="text-slate-500">High warn / crit</span>
                      <span className="text-slate-300">{fmt(rule.highWarning)} / {fmt(rule.highCritical)}</span>
                      <span className="text-slate-500">Debounce</span>
                      <span className="text-slate-300">{rule.debounceSeconds}s</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full min-w-[800px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-xs text-slate-500 uppercase tracking-wide">
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
                      <tr key={rule.id} className={`border-b border-slate-800 hover:bg-slate-800/40 transition-colors ${!rule.enabled ? "opacity-40" : ""}`}>
                        <td className="px-4 py-3 font-semibold text-slate-200">{metricLabel(rule.metric)}</td>
                        <td className="px-4 py-3 text-slate-400">{rule.label}</td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-slate-700 border border-slate-600 px-2 py-0.5 text-xs font-semibold text-slate-300">{scopeOf(rule)}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{scopeId(rule)}</td>
                        <td className="px-4 py-3 text-slate-300">{fmt(rule.lowWarning)}</td>
                        <td className="px-4 py-3 text-slate-300">{fmt(rule.lowCritical)}</td>
                        <td className="px-4 py-3 text-slate-300">{fmt(rule.highWarning)}</td>
                        <td className="px-4 py-3 text-slate-300">{fmt(rule.highCritical)}</td>
                        <td className="px-4 py-3 text-slate-300">{rule.debounceSeconds}s</td>
                        <td className="px-4 py-3">
                          <button
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${rule.enabled ? "bg-emerald-900/40 border border-emerald-800 text-emerald-400 hover:bg-emerald-900/60" : "bg-slate-700 border border-slate-600 text-slate-400 hover:bg-slate-600"}`}
                            onClick={() => toggleEnabled(rule)}
                            type="button"
                          >
                            {rule.enabled ? "Yes" : "No"}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button className="text-slate-500 hover:text-slate-300 transition-colors" onClick={() => openEdit(rule)} type="button" title="Edit"><Pencil size={14} /></button>
                            <button className="text-red-600 hover:text-red-400 transition-colors" onClick={() => deleteRule(rule.id)} type="button" title="Delete"><Trash2 size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <div className="rounded-lg border border-slate-700 p-4 text-sm text-slate-400" style={{ background: "var(--surface-2)" }}>
          <p className="font-semibold mb-1 text-slate-300">Rule resolution priority</p>
          <ol className="list-decimal ml-4 space-y-0.5 text-slate-500">
            <li>Device rule (highest priority)</li>
            <li>UPS unit rule</li>
            <li>Site rule</li>
            <li>Global rule</li>
            <li>Built-in defaults (lowest priority)</li>
          </ol>
          <p className="mt-2 text-slate-600">Only one rule applies per metric per device. DB rules override built-in defaults — they do not stack.</p>
        </div>
      </div>
    </AppShell>
  );
}
