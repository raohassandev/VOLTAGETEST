"use client";

import {
  CheckCircle2, ChevronDown, Edit2, Plus, RefreshCw, Router,
  Save, Server, Settings2, Trash2, Wifi, X,
} from "lucide-react";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { checkUnauthorized, guardManufacturer } from "@/lib/handle-unauthorized";

// ── shared styles ─────────────────────────────────────────────────────────────
const inp = "w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-colors placeholder:text-slate-600";
const lbl = "block text-xs font-semibold text-slate-400 mb-1";

// ── types ─────────────────────────────────────────────────────────────────────
interface SysSettings { rawRetentionDays: number; rollupRetentionMonths: number; alarmRetentionMonths: number; offlineThresholdSecs: number; }
interface BoardInfo   { device_id: string; firmware: string; mac: string; ip: string; mqtt_host: string; mqtt_port: number; mqtt_topic: string; mqtt_auth: boolean; }
interface BoardData   { volt_in?: number; volt_out?: number; volt_dc?: number; rssi?: number; seq?: number; }
interface KnownDevice { deviceId: string; ip: string | null; mac: string | null; firmware: string | null; online: boolean; upsId: string | null; }
interface MqttBroker  { id: string; name: string; host: string; port: number; username: string; password: string; enabled: boolean; notes: string; }

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({
  icon: Icon, title, subtitle, defaultOpen = true, children,
}: {
  icon: React.ElementType; title: string; subtitle?: string;
  defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-700 overflow-hidden" style={{ background: "var(--surface-1)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-800/30 transition-colors text-left"
      >
        <Icon size={16} className="text-cyan-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-100">{title}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <ChevronDown size={15} className={`text-slate-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-5 pb-5 pt-1 border-t border-slate-700/60">{children}</div>}
    </div>
  );
}

// ── MQTT broker row ───────────────────────────────────────────────────────────
function BrokerRow({
  broker, onToggle, onDelete, onEdit,
}: { broker: MqttBroker; onToggle: () => void; onDelete: () => void; onEdit: () => void }) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-all ${
      broker.enabled ? "border-cyan-800/60 bg-cyan-900/10" : "border-slate-700 opacity-60"
    }`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-100 truncate">{broker.name}</p>
        <p className="text-xs text-slate-500 font-mono truncate">
          mqtt://{broker.username ? `${broker.username}@` : ""}{broker.host}:{broker.port}
        </p>
        {broker.notes && <p className="text-xs text-slate-600 mt-0.5 italic truncate">{broker.notes}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
          broker.enabled ? "bg-emerald-900/40 text-emerald-400 border border-emerald-800" : "bg-slate-800 text-slate-500 border border-slate-700"
        }`}>
          {broker.enabled ? "Enabled" : "Disabled"}
        </span>
        <button onClick={onEdit}   type="button" title="Edit"   className="p-1.5 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-slate-700 transition-colors"><Edit2 size={13} /></button>
        <button onClick={onToggle} type="button" title={broker.enabled ? "Disable" : "Enable"} className="p-1.5 rounded-md text-slate-400 hover:text-amber-300 hover:bg-slate-700 transition-colors"><Wifi size={13} /></button>
        <button onClick={onDelete} type="button" title="Delete" className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

// ── Broker form modal ─────────────────────────────────────────────────────────
function BrokerModal({
  initial, onSave, onClose,
}: {
  initial?: Partial<MqttBroker>;
  onSave: (data: Omit<MqttBroker, "id" | "enabled" | "createdAt" | "updatedAt">) => Promise<void>;
  onClose: () => void;
}) {
  const [name,     setName]     = useState(initial?.name     ?? "");
  const [host,     setHost]     = useState(initial?.host     ?? "");
  const [port,     setPort]     = useState(initial?.port     ?? 1883);
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState(initial?.password ?? "");
  const [notes,    setNotes]    = useState(initial?.notes    ?? "");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");

  async function submit() {
    if (!name.trim() || !host.trim()) { setError("Name and host are required."); return; }
    setSaving(true); setError("");
    try { await onSave({ name, host, port, username, password, notes }); onClose(); }
    catch { setError("Save failed."); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 shadow-2xl p-6" style={{ background: "var(--surface-2)" }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-slate-100 flex items-center gap-2"><Server size={15} className="text-cyan-400" />{initial?.id ? "Edit Broker" : "Add MQTT Broker"}</h3>
          <button onClick={onClose} type="button" className="p-1.5 rounded-md text-slate-400 hover:bg-slate-700"><X size={15} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <div><label className={lbl}>Broker Name *</label><input className={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Site A Mosquitto" /></div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2"><label className={lbl}>Host / IP *</label><input className={inp} value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.0.1 or broker.example.com" /></div>
            <div><label className={lbl}>Port</label><input className={inp} type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} min={1} max={65535} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Username</label><input className={inp} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="(blank = anonymous)" /></div>
            <div><label className={lbl}>Password</label><input className={inp} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="(blank = keep existing)" /></div>
          </div>
          <div><label className={lbl}>Notes</label><input className={inp} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional description" /></div>
          {error && <p className="text-xs text-red-400 font-semibold">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={submit} disabled={saving} type="button" className="flex-1 rounded-lg bg-cyan-700 hover:bg-cyan-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : "Save Broker"}
            </button>
            <button onClick={onClose} type="button" className="rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-400 hover:bg-slate-700 transition-colors">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SettingsAdminPage() {
  guardManufacturer();

  // ── System settings ──────────────────────────────────────────────────────
  const [sys,     setSys]     = useState<SysSettings>({ rawRetentionDays: 30, rollupRetentionMonths: 12, alarmRetentionMonths: 24, offlineThresholdSecs: 60 });
  const [sysSaving, setSysSaving] = useState(false);
  const [sysMsg,  setSysMsg]  = useState("");

  // ── Board config ─────────────────────────────────────────────────────────
  const [knownDevices,  setKnownDevices]  = useState<KnownDevice[]>([]);
  const [selectedDev,   setSelectedDev]   = useState<KnownDevice | null>(null);
  const [boardInfo,     setBoardInfo]     = useState<BoardInfo | null>(null);
  const [boardData,     setBoardData]     = useState<BoardData | null>(null);
  const [boardLoading,  setBoardLoading]  = useState(false);
  const [boardError,    setBoardError]    = useState("");
  const [cfgMqttHost,   setCfgMqttHost]   = useState("");
  const [cfgMqttPort,   setCfgMqttPort]   = useState(1883);
  const [cfgMqttUser,   setCfgMqttUser]   = useState("");
  const [cfgMqttPass,   setCfgMqttPass]   = useState("");
  const [cfgSsid,       setCfgSsid]       = useState("");
  const [cfgDeviceId,   setCfgDeviceId]   = useState("");
  const [cfgMode,       setCfgMode]       = useState<"dhcp" | "static">("dhcp");
  const [cfgStaticIp,   setCfgStaticIp]   = useState("");
  const [cfgGw,         setCfgGw]         = useState("");
  const [cfgSn,         setCfgSn]         = useState("255.255.255.0");
  const [cfgSaving,     setCfgSaving]     = useState(false);
  const [cfgMsg,        setCfgMsg]        = useState("");

  // ── MQTT brokers ─────────────────────────────────────────────────────────
  const [brokers,      setBrokers]      = useState<MqttBroker[]>([]);
  const [brokerModal,  setBrokerModal]  = useState<"new" | MqttBroker | null>(null);
  const [brokerLoading, setBrokerLoading] = useState(true);

  // ── Load known devices ───────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/devices", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { devices?: KnownDevice[] }) => setKnownDevices(d.devices ?? []))
      .catch(() => undefined);
  }, []);

  // Auto-fetch board info when a device is selected
  async function selectDevice(dev: KnownDevice) {
    setSelectedDev(dev);
    setBoardInfo(null); setBoardData(null); setBoardError(""); setCfgMsg("");
    if (!dev.ip) { setBoardError("This device has no IP address on record — it may not have connected recently."); return; }
    setBoardLoading(true);
    try {
      const [infoRes, dataRes] = await Promise.all([
        fetch(`/api/board-proxy?ip=${encodeURIComponent(dev.ip)}&path=api/info`),
        fetch(`/api/board-proxy?ip=${encodeURIComponent(dev.ip)}&path=data`),
      ]);
      if (!infoRes.ok) throw new Error(`Board at ${dev.ip} not reachable`);
      const info = (await infoRes.json()) as BoardInfo;
      const data = dataRes.ok ? (await dataRes.json()) as BoardData : null;
      setBoardInfo(info);
      setBoardData(data);
      setCfgMqttHost(info.mqtt_host);
      setCfgMqttPort(info.mqtt_port);
      setCfgDeviceId(info.device_id);
      setCfgMqttUser("");
    } catch (e) {
      setBoardError(e instanceof Error ? e.message : "Could not reach board");
    } finally { setBoardLoading(false); }
  }

  async function refreshBoard() {
    if (selectedDev) await selectDevice(selectedDev);
  }

  // ── Load system settings ─────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => { if (checkUnauthorized(r)) throw new Error("401"); return r.json(); })
      .then((d: { settings?: Partial<SysSettings>; offlineThresholdSecs?: number }) => {
        setSys({
          rawRetentionDays:      d.settings?.rawRetentionDays      ?? 30,
          rollupRetentionMonths: d.settings?.rollupRetentionMonths ?? 12,
          alarmRetentionMonths:  d.settings?.alarmRetentionMonths  ?? 24,
          offlineThresholdSecs:  d.offlineThresholdSecs            ?? 60,
        });
      }).catch(() => undefined);
  }, []);

  // ── Load MQTT brokers ────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/mqtt-brokers", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { brokers?: MqttBroker[] }) => setBrokers(d.brokers ?? []))
      .catch(() => undefined)
      .finally(() => setBrokerLoading(false));
  }, []);

  async function saveSys() {
    setSysSaving(true); setSysMsg("");
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: sys, offlineThresholdSecs: sys.offlineThresholdSecs }) });
      setSysMsg(res.ok ? "✓ Settings saved." : "Save failed.");
    } finally { setSysSaving(false); }
  }

  async function pushBoardConfig() {
    if (!selectedDev?.ip || !boardInfo) return;
    setCfgSaving(true); setCfgMsg("");
    try {
      const res = await fetch("/api/board-config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip: selectedDev.ip, ssid: cfgSsid, mqttHost: cfgMqttHost, mqttPort: cfgMqttPort,
          mqttUser: cfgMqttUser, mqttPass: cfgMqttPass, deviceId: cfgDeviceId,
          mode: cfgMode, staticIp: cfgStaticIp, gw: cfgGw, sn: cfgSn,
        }),
      });
      const d = (await res.json()) as { ok?: boolean; error?: string };
      setCfgMsg(d.ok ? "✓ Config pushed — board will reconnect." : `Error: ${d.error ?? "Failed"}`);
    } finally { setCfgSaving(false); }
  }

  // ── MQTT broker actions ──────────────────────────────────────────────────
  async function addBroker(data: Omit<MqttBroker, "id" | "enabled">) {
    const res = await fetch("/api/mqtt-brokers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const d = (await res.json()) as { broker?: MqttBroker };
    if (d.broker) setBrokers((b) => [...b, d.broker!]);
  }

  async function editBroker(id: string, data: Partial<MqttBroker>) {
    const res = await fetch(`/api/mqtt-brokers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const d = (await res.json()) as { broker?: MqttBroker };
    if (d.broker) setBrokers((b) => b.map((x) => x.id === id ? d.broker! : x));
  }

  async function deleteBroker(id: string) {
    if (!confirm("Delete this MQTT broker?")) return;
    await fetch(`/api/mqtt-brokers/${id}`, { method: "DELETE" });
    setBrokers((b) => b.filter((x) => x.id !== id));
  }

  return (
    <AppShell activeNav="settings">
      {brokerModal && (
        <BrokerModal
          initial={brokerModal === "new" ? undefined : brokerModal}
          onClose={() => setBrokerModal(null)}
          onSave={async (data) => {
            if (brokerModal === "new") {
              await addBroker(data);
            } else {
              await editBroker(brokerModal.id, data);
            }
          }}
        />
      )}

      <div className="flex max-w-3xl flex-col gap-4 iot-page">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manufacturer-level system, board, and broker configuration.</p>
        </div>

        {/* ── 1. System Settings ──────────────────────────────────────── */}
        <Section icon={Settings2} title="System Settings" subtitle="Data retention and device monitoring thresholds">
          <div className="mt-4 flex flex-col gap-5">

            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Data Retention</p>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  { label: "Raw telemetry (days)",   key: "rawRetentionDays",      min: 1,  max: 365 },
                  { label: "Rollup history (months)", key: "rollupRetentionMonths", min: 1,  max: 120 },
                  { label: "Alarm history (months)",  key: "alarmRetentionMonths",  min: 1,  max: 120 },
                ].map(({ label, key, min, max }) => (
                  <label key={key} className="flex flex-col gap-1">
                    <span className={lbl}>{label}</span>
                    <input className={inp} type="number" min={min} max={max}
                      value={sys[key as keyof SysSettings]}
                      onChange={(e) => setSys((s) => ({ ...s, [key]: Number(e.target.value) }))}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Device Monitoring</p>
              <label className="flex flex-col gap-1 max-w-xs">
                <span className={lbl}>Offline threshold (seconds)</span>
                <input className={inp} type="number" min={10} max={3600}
                  value={sys.offlineThresholdSecs}
                  onChange={(e) => setSys((s) => ({ ...s, offlineThresholdSecs: Number(e.target.value) }))}
                />
                <span className="text-xs text-slate-600">Device marked offline if no telemetry for this many seconds.</span>
              </label>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button onClick={saveSys} disabled={sysSaving} type="button"
                className="flex items-center gap-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition-colors">
                <Save size={14} />{sysSaving ? "Saving…" : "Save Settings"}
              </button>
              {sysMsg && <span className="text-sm font-semibold text-emerald-400 flex items-center gap-1"><CheckCircle2 size={13} />{sysMsg}</span>}
            </div>
          </div>
        </Section>

        {/* ── 2. Board Configuration ──────────────────────────────────── */}
        <Section icon={Router} title="Board Configuration" subtitle="Select a board to view and push parameters" defaultOpen={false}>
          <div className="mt-4 flex flex-col gap-4">

            {/* Device selector */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Select Board</p>
                {selectedDev && (
                  <button onClick={refreshBoard} disabled={boardLoading} type="button"
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300 transition-colors">
                    <RefreshCw size={11} className={boardLoading ? "animate-spin" : ""} /> Refresh
                  </button>
                )}
              </div>

              {knownDevices.length === 0 ? (
                <p className="text-sm text-slate-500 py-3 text-center">No devices in database yet.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {knownDevices.map((dev) => (
                    <button
                      key={dev.deviceId}
                      type="button"
                      onClick={() => selectDevice(dev)}
                      className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all ${
                        selectedDev?.deviceId === dev.deviceId
                          ? "border-cyan-600 bg-cyan-900/20 ring-1 ring-cyan-700/40"
                          : "border-slate-700 hover:border-slate-500 hover:bg-slate-800/40"
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${dev.online ? "bg-emerald-400 shadow-sm shadow-emerald-400/50" : "bg-slate-600"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-100 truncate">{dev.deviceId}</p>
                        <p className="text-xs text-slate-500 font-mono truncate">
                          {dev.ip ?? "no IP"} {dev.firmware ? `· fw ${dev.firmware}` : ""}
                        </p>
                        {dev.upsId && <p className="text-xs text-cyan-500 truncate">{dev.upsId}</p>}
                      </div>
                      <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0 ${
                        dev.online ? "bg-emerald-900/40 text-emerald-400" : "bg-slate-800 text-slate-500"
                      }`}>{dev.online ? "Online" : "Offline"}</span>
                    </button>
                  ))}
                </div>
              )}

              {boardLoading && (
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-400">
                  <RefreshCw size={13} className="animate-spin text-cyan-400" /> Connecting to board…
                </div>
              )}
              {boardError && <p className="mt-2 text-xs text-red-400 font-semibold">⚠ {boardError}</p>}
            </div>

            {/* Board current status */}
            {boardInfo && (
              <div className="rounded-lg border border-slate-700 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ background: "var(--surface-2)" }}>
                {[
                  { label: "Device ID",  value: boardInfo.device_id },
                  { label: "Firmware",   value: boardInfo.firmware  },
                  { label: "MAC",        value: boardInfo.mac       },
                  { label: "Current IP", value: boardInfo.ip        },
                  { label: "MQTT Host",  value: boardInfo.mqtt_host },
                  { label: "MQTT Port",  value: String(boardInfo.mqtt_port) },
                  { label: "MQTT Auth",  value: boardInfo.mqtt_auth ? "Yes" : "No" },
                  { label: "Topic",      value: boardInfo.mqtt_topic },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
                    <p className="text-xs font-mono text-slate-200 break-all">{value}</p>
                  </div>
                ))}
                {boardData && (
                  <>
                    {[
                      { label: "Pri. Voltage",  value: boardData.volt_in  != null ? `${boardData.volt_in.toFixed(1)} V` : "—" },
                      { label: "Sec. Voltage", value: boardData.volt_out != null ? `${boardData.volt_out.toFixed(1)} V` : "—" },
                      { label: "Battery V",  value: boardData.volt_dc  != null ? `${boardData.volt_dc.toFixed(2)} V` : "—" },
                      { label: "RSSI",  value: boardData.rssi     != null ? `${boardData.rssi} dBm` : "—" },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</p>
                        <p className="text-xs font-mono text-cyan-300">{value}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Config form */}
            {boardInfo && (
              <div className="flex flex-col gap-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Board Configuration</p>
                <div className="rounded-lg border border-amber-800 bg-amber-900/20 p-3 text-xs font-semibold text-amber-300">
                  Remote config push is not supported in firmware v2.1.0 or production external-broker mode. Use the board local web UI at http://&lt;device-ip&gt;/config.
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={lbl}>Device ID</label>
                    <input className={inp} value={cfgDeviceId} onChange={(e) => setCfgDeviceId(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>WiFi SSID</label>
                    <input className={inp} value={cfgSsid} onChange={(e) => setCfgSsid(e.target.value)} placeholder="(blank = keep existing)" />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">MQTT Broker</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className={lbl}>Host / IP</label>
                      <input className={inp} value={cfgMqttHost} onChange={(e) => setCfgMqttHost(e.target.value)} placeholder="192.168.0.104" />
                    </div>
                    <div>
                      <label className={lbl}>Port</label>
                      <input className={inp} type="number" value={cfgMqttPort} onChange={(e) => setCfgMqttPort(Number(e.target.value))} min={1} max={65535} />
                    </div>
                    <div>
                      <label className={lbl}>Username</label>
                      <input className={inp} value={cfgMqttUser} onChange={(e) => setCfgMqttUser(e.target.value)} placeholder="(blank = anonymous)" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={lbl}>Password</label>
                      <input className={inp} type="password" value={cfgMqttPass} onChange={(e) => setCfgMqttPass(e.target.value)} placeholder="(blank = keep existing)" />
                    </div>
                  </div>
                  {/* Quick-fill from broker list */}
                  {brokers.filter((b) => b.enabled).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] text-slate-500 font-semibold">Quick-fill:</span>
                      {brokers.filter((b) => b.enabled).map((b) => (
                        <button key={b.id} type="button"
                          onClick={() => { setCfgMqttHost(b.host); setCfgMqttPort(b.port); setCfgMqttUser(b.username); }}
                          className="rounded-full border border-slate-600 px-2 py-0.5 text-[10px] font-semibold text-slate-300 hover:border-cyan-600 hover:text-cyan-300 transition-colors">
                          {b.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Network Mode</p>
                  <div className="flex gap-2 mb-3">
                    {(["dhcp", "static"] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setCfgMode(m)}
                        className={`rounded-lg border px-4 py-1.5 text-xs font-semibold uppercase transition-colors ${
                          cfgMode === m ? "border-cyan-600 bg-cyan-900/40 text-cyan-300" : "border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                        }`}>{m}</button>
                    ))}
                  </div>
                  {cfgMode === "static" && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div><label className={lbl}>Static IP</label><input className={inp} value={cfgStaticIp} onChange={(e) => setCfgStaticIp(e.target.value)} placeholder="192.168.0.150" /></div>
                      <div><label className={lbl}>Gateway</label><input className={inp} value={cfgGw} onChange={(e) => setCfgGw(e.target.value)} placeholder="192.168.0.1" /></div>
                      <div><label className={lbl}>Subnet</label><input className={inp} value={cfgSn} onChange={(e) => setCfgSn(e.target.value)} /></div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button onClick={pushBoardConfig} disabled type="button"
                    title="Remote config push is not supported in firmware v2.1.0 / production external-broker mode."
                    className="flex items-center gap-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition-colors">
                    <Save size={14} />{cfgSaving ? "Pushing..." : "Config Push Unsupported"}
                  </button>
                  {cfgMsg && (
                    <span className={`text-sm font-semibold flex items-center gap-1 ${cfgMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>
                      {cfgMsg.startsWith("✓") && <CheckCircle2 size={13} />}{cfgMsg}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600">Board will save config and reconnect. WiFi/MQTT password fields left blank will keep existing values.</p>
              </div>
            )}
          </div>
        </Section>

        {/* ── 3. MQTT Brokers ─────────────────────────────────────────── */}
        <Section icon={Server} title="MQTT Broker Connections" subtitle="Dashboard worker connects to all enabled brokers" defaultOpen={true}>
          <div className="mt-4 flex flex-col gap-3">
            {brokerLoading ? (
              <p className="text-sm text-slate-500 py-4 text-center">Loading brokers…</p>
            ) : brokers.length === 0 ? (
              <div className="rounded-lg border border-slate-700 border-dashed py-8 text-center">
                <p className="text-sm text-slate-500">No MQTT brokers configured.</p>
                <p className="text-xs text-slate-600 mt-1">Add one below — the worker will subscribe to <span className="font-mono">ums/devices/+/data</span> on each enabled broker.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {brokers.map((b) => (
                  <BrokerRow
                    key={b.id}
                    broker={b}
                    onToggle={() => editBroker(b.id, { enabled: !b.enabled })}
                    onDelete={() => deleteBroker(b.id)}
                    onEdit={() => setBrokerModal(b)}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setBrokerModal("new")}
              className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-slate-600 py-3 text-sm font-semibold text-slate-400 hover:border-cyan-600 hover:text-cyan-300 transition-colors"
            >
              <Plus size={14} /> Add MQTT Broker
            </button>

            <p className="text-xs text-slate-600 pt-1">
              ⚠️ Changes take effect after restarting the dashboard server. Brokers are persisted in the database.
            </p>
          </div>
        </Section>

      </div>
    </AppShell>
  );
}
