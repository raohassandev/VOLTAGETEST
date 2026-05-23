"use client";

import { Cpu, ExternalLink, Radio, RefreshCw, Search, Trash2, Wifi, WifiOff, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";

interface Board {
  deviceId: string;
  upsId: string | null;
  upsName: string | null;
  floor: string | null;
  location: string | null;
  mac: string | null;
  ip: string | null;
  firmware: string | null;
  lastSeenAt: string | null;
  online: boolean;
}

interface Discovered {
  id: string;
  ip: string;
  mac: string | null;
  hostname: string | null;
  boardConfirmed: boolean;
  deviceId: string | null;
  firmware: string | null;
  lastSeenAt: string;
  rawInfo: Record<string, unknown> | null;
}

type Tab = "mqtt" | "discovered" | "all";

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (d < 1) return "just now";
  if (d < 60) return `${d}m ago`;
  const h = Math.floor(d / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function CommandBtn({ deviceId }: { deviceId: string }) {
  return (
    <span
      className="inline-flex items-center rounded bg-slate-700 border border-slate-600 px-2 py-1 text-xs text-slate-500"
      title={`Commands are disabled until firmware subscribes to ums/devices/${deviceId}/command.`}
    >
      Commands disabled
    </span>
  );
}

export default function BoardsPage() {
  const [boards, setBoards]           = useState<Board[]>([]);
  const [discovered, setDiscovered]   = useState<Discovered[]>([]);
  const [tab, setTab]                 = useState<Tab>("mqtt");
  const [search, setSearch]           = useState("");
  const [loading, setLoading]         = useState(true);
  const [scanning, setScanning]       = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const esRef = useRef<EventSource | null>(null);

  function loadAll() {
    setLoading(true);
    Promise.all([
      fetch("/api/devices",    { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/discovered", { cache: "no-store" }).then((r) => r.json()),
    ]).then(([devData, discData]) => {
      setBoards((devData as { devices?: Board[] }).devices ?? []);
      setDiscovered((discData as { discovered?: Discovered[] }).discovered ?? []);
      setLastUpdated(new Date());
    }).catch(() => undefined)
      .finally(() => setLoading(false));
  }

  async function triggerScan() {
    setScanning(true);
    await fetch("/api/discovered/scan", { method: "POST" });
    setTimeout(() => { setScanning(false); loadAll(); }, 8_000);
  }

  async function deleteDevice(deviceId: string) {
    if (!confirm(`Remove device "${deviceId}"?\n\nThis will hide it from boards and telemetry views. It will reappear if it sends new MQTT messages.`)) return;
    setDeletingId(deviceId);
    try {
      await fetch(`/api/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE" });
      setBoards((prev) => prev.filter((b) => b.deviceId !== deviceId));
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    loadAll(); // eslint-disable-line react-hooks/set-state-in-effect
    const es = new EventSource("/api/events");
    esRef.current = es;
    es.addEventListener("device-online",  () => loadAll());
    es.addEventListener("device-offline", () => loadAll());
    es.addEventListener("scan-result",    () => loadAll());
    return () => es.close();
  }, []);

  const q = search.toLowerCase();
  const filteredBoards = boards.filter((b) =>
    !q || [b.deviceId, b.upsId, b.mac, b.ip, b.firmware, b.floor, b.location].some((v) => v?.toLowerCase().includes(q)),
  );
  const filteredDisc = discovered.filter((d) =>
    !q || [d.ip, d.mac, d.deviceId, d.firmware].some((v) => v?.toLowerCase().includes(q)),
  );

  const mqttOnline  = boards.filter((b) => b.online).length;
  const mqttOffline = boards.length - mqttOnline;
  const discNew     = discovered.filter((d) => d.boardConfirmed && !d.deviceId).length;
  const fwVersions  = [...new Set(boards.map((b) => b.firmware).filter(Boolean))];

  const sectionStyle = { background: "var(--surface-1)", borderColor: "var(--border-default)" };

  return (
    <AppShell activeNav="boards">
      <div className="flex flex-col gap-4 iot-page">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-cyan-500" />
            <h1 className="text-xl font-bold text-white sm:text-2xl">Board Management</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={triggerScan} disabled={scanning}
              className="flex items-center gap-1.5 rounded-md border border-slate-600 px-3 py-1.5 text-sm font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors">
              <Search size={14} className={scanning ? "animate-pulse" : ""} />
              <span className="hidden sm:inline">{scanning ? "Scanning…" : "Scan LAN"}</span>
              <span className="sm:hidden">{scanning ? "…" : "Scan"}</span>
            </button>
            <button onClick={loadAll} disabled={loading}
              className="flex items-center gap-1.5 rounded-md border border-slate-600 px-3 py-1.5 text-sm font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "MQTT Connected", value: mqttOnline,  border: "border-emerald-800", textColor: "text-emerald-400" },
            { label: "MQTT Offline",   value: mqttOffline, border: mqttOffline ? "border-red-800"   : "border-slate-700", textColor: mqttOffline ? "text-red-400"   : "text-slate-500" },
            { label: "LAN Discovered", value: discovered.filter((d) => d.boardConfirmed).length, border: "border-cyan-900", textColor: "text-cyan-400" },
            { label: "Unregistered",   value: discNew,     border: discNew   ? "border-amber-800"  : "border-slate-700", textColor: discNew   ? "text-amber-400" : "text-slate-500" },
          ].map((s) => (
            <div key={s.label} className={`rounded-lg border ${s.border} p-3 sm:p-4`} style={{ background: "var(--surface-1)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 truncate">{s.label}</p>
              <p className={`mt-0.5 text-xl font-bold ${s.textColor}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Firmware versions */}
        {fwVersions.length > 0 && (
          <div className="rounded-lg border border-slate-700 px-4 py-3" style={{ background: "var(--surface-1)" }}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Firmware in fleet</p>
            <div className="flex flex-wrap gap-2">
              {fwVersions.map((v) => (
                <span key={v} className="rounded-full bg-slate-700 border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-300">
                  v{v} <span className="text-slate-500">({boards.filter((b) => b.firmware === v).length})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Command support notice */}
        <div className="rounded-lg border border-amber-800 bg-amber-900/20 px-4 py-2.5 text-xs text-amber-300 flex items-start gap-2">
          <span className="font-bold text-amber-400 shrink-0">Note:</span>
          <span>Device commands require firmware subscribed to <code className="font-mono bg-amber-900/40 px-1 rounded">ums/devices/&#123;id&#125;/command</code>. Current firmware does not support this.</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-slate-700 overflow-x-auto">
          {([
            { key: "mqtt",       label: `MQTT (${mqttOnline}/${boards.length})` },
            { key: "discovered", label: `LAN (${discovered.filter((d) => d.boardConfirmed).length})` },
            { key: "all",        label: "All" },
          ] as { key: Tab; label: string }[]).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`shrink-0 px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === t.key ? "border-cyan-500 text-cyan-300" : "border-transparent text-slate-500 hover:text-slate-300"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <input
            className="flex-1 sm:flex-none sm:w-64 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-600 transition-colors"
            style={{ background: "var(--surface-2)" }}
            placeholder="Search device, IP, MAC…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {lastUpdated && (
            <span className="text-xs text-slate-600 whitespace-nowrap">Updated {timeAgo(lastUpdated.toISOString())}</span>
          )}
        </div>

        {/* MQTT Boards */}
        {(tab === "mqtt" || tab === "all") && (
          <section className="rounded-lg border" style={sectionStyle}>
            <div className="border-b border-slate-700 px-4 py-3 flex items-center gap-2">
              <Zap size={14} className="text-emerald-400" />
              <p className="text-sm font-semibold text-slate-300">Registered MQTT Boards</p>
              <span className="ml-auto text-xs text-slate-600">{filteredBoards.length} device{filteredBoards.length !== 1 ? "s" : ""}</span>
            </div>

            {loading ? (
              <p className="p-8 text-center text-sm text-slate-500">Loading…</p>
            ) : filteredBoards.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">No boards found. Start the MQTT broker and connect a board.</p>
            ) : (
              <>
                {/* Mobile card view */}
                <div className="divide-y divide-slate-800 sm:hidden">
                  {filteredBoards.map((b) => (
                    <div key={b.deviceId} className={`p-4 ${!b.online ? "opacity-50" : ""}`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-bold text-slate-200 truncate">{b.deviceId}</p>
                          {b.upsId && <p className="text-xs text-cyan-400 mt-0.5">{b.upsId}</p>}
                          {(b.floor || b.location) && (
                            <p className="text-xs text-slate-500 mt-0.5">{[b.floor, b.location].filter(Boolean).join(" / ")}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {b.online
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 border border-emerald-800 px-2 py-0.5 text-xs font-bold text-emerald-400"><Wifi size={9} /> Online</span>
                            : <span className="inline-flex items-center gap-1 rounded-full bg-slate-700 border border-slate-600 px-2 py-0.5 text-xs font-bold text-slate-400"><WifiOff size={9} /> Offline</span>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {b.ip && (
                          <a href={`http://${b.ip}/`} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-cyan-400 hover:underline">
                            {b.ip} <ExternalLink size={9} />
                          </a>
                        )}
                        {b.firmware && (
                          <span className="rounded-full bg-slate-700 border border-slate-600 px-2 py-0.5 font-semibold text-slate-300">v{b.firmware}</span>
                        )}
                        <span className="text-slate-600">{timeAgo(b.lastSeenAt)}</span>
                        <button
                          className="ml-auto inline-flex items-center gap-1 rounded border border-red-800 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-40"
                          onClick={() => deleteDevice(b.deviceId)}
                          disabled={deletingId === b.deviceId}
                          type="button"
                        >
                          <Trash2 size={11} /> Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full min-w-[860px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-3">Device ID</th>
                        <th className="px-4 py-3">UPS</th>
                        <th className="px-4 py-3">Location</th>
                        <th className="px-4 py-3">IP</th>
                        <th className="px-4 py-3">MAC</th>
                        <th className="px-4 py-3">FW</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Last seen</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBoards.map((b) => (
                        <tr key={b.deviceId} className={`border-b border-slate-800 hover:bg-slate-800/40 transition-colors ${!b.online ? "opacity-50" : ""}`}>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-200 whitespace-nowrap">{b.deviceId}</td>
                          <td className="px-4 py-3 text-xs">
                            {b.upsId
                              ? <span className="font-semibold text-cyan-400">{b.upsId}</span>
                              : <span className="text-slate-500 italic">unassigned</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-[140px] truncate">
                            {[b.floor, b.location].filter(Boolean).join(" / ") || "—"}
                          </td>
                          <td className="px-4 py-3">
                            {b.ip
                              ? <a href={`http://${b.ip}/`} target="_blank" rel="noreferrer"
                                  className="inline-flex items-center gap-1 font-mono text-xs text-cyan-400 hover:underline">
                                  {b.ip} <ExternalLink size={9} />
                                </a>
                              : <span className="text-xs text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{b.mac ?? "—"}</td>
                          <td className="px-4 py-3">
                            {b.firmware
                              ? <span className="rounded-full bg-slate-700 border border-slate-600 px-2 py-0.5 text-xs font-semibold text-slate-300">v{b.firmware}</span>
                              : <span className="text-xs text-slate-600">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            {b.online
                              ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 border border-emerald-800 px-2 py-0.5 text-xs font-bold text-emerald-400"><Wifi size={10} /> Online</span>
                              : <span className="inline-flex items-center gap-1 rounded-full bg-slate-700 border border-slate-600 px-2 py-0.5 text-xs font-bold text-slate-400"><WifiOff size={10} /> Offline</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{timeAgo(b.lastSeenAt)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1 items-center">
                              {b.ip && <>
                                <a href={`http://${b.ip}/config`} target="_blank" rel="noreferrer"
                                  className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-600">Config</a>
                                <a href={`http://${b.ip}/update`} target="_blank" rel="noreferrer"
                                  className="rounded bg-cyan-900/50 border border-cyan-800 px-2 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/70">OTA</a>
                              </>}
                              {b.online && <CommandBtn deviceId={b.deviceId} />}
                              <button
                                className="inline-flex items-center rounded border border-red-800 p-1 text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-40 ml-auto"
                                onClick={() => deleteDevice(b.deviceId)}
                                disabled={deletingId === b.deviceId}
                                type="button"
                                title="Remove device"
                              >
                                <Trash2 size={13} />
                              </button>
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
        )}

        {/* LAN Discovered */}
        {(tab === "discovered" || tab === "all") && (
          <section className="rounded-lg border" style={sectionStyle}>
            <div className="border-b border-slate-700 px-4 py-3 flex items-center gap-2 flex-wrap">
              <Radio size={14} className="text-cyan-500" />
              <p className="text-sm font-semibold text-slate-300">LAN Discovered Boards</p>
              <span className="text-xs text-slate-600">— found by ARP scan</span>
            </div>
            {filteredDisc.filter((d) => d.boardConfirmed).length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-slate-500">No boards discovered on LAN yet.</p>
                <p className="text-xs text-slate-600 mt-1">Click <strong className="text-slate-400">Scan LAN</strong> to search.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">IP Address</th>
                      <th className="px-4 py-3">MAC</th>
                      <th className="px-4 py-3">Device ID</th>
                      <th className="px-4 py-3">FW</th>
                      <th className="px-4 py-3">Last seen</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDisc.filter((d) => d.boardConfirmed).map((d) => (
                      <tr key={d.id} className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3">
                          <a href={`http://${d.ip}/`} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs text-cyan-400 hover:underline">
                            {d.ip} <ExternalLink size={9} />
                          </a>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{d.mac ?? "—"}</td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {d.deviceId
                            ? <span className="font-semibold text-emerald-400">{d.deviceId}</span>
                            : <span className="text-amber-400 italic">unknown</span>}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {d.firmware
                            ? <span className="rounded-full bg-slate-700 border border-slate-600 px-2 py-0.5 font-semibold text-slate-300">v{d.firmware}</span>
                            : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{timeAgo(d.lastSeenAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <a href={`http://${d.ip}/`} target="_blank" rel="noreferrer"
                              className="rounded bg-cyan-900/50 border border-cyan-800 px-2 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/70">
                              Open
                            </a>
                            <a href={`http://${d.ip}/config`} target="_blank" rel="noreferrer"
                              className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-600">
                              Config
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Help note */}
        <div className="rounded-lg border border-slate-700 p-4 text-xs text-slate-500" style={{ background: "var(--surface-2)" }}>
          <p className="font-semibold text-slate-400 mb-1">Board not showing up?</p>
          <p>Configure the board to connect to MQTT at <code className="bg-slate-700 px-1 rounded text-slate-300">ums-server.local:1883</code> or <code className="bg-slate-700 px-1 rounded text-slate-300">192.168.0.111:1883</code>, then click <strong className="text-slate-300">Scan LAN</strong>.</p>
          <p className="mt-1.5 text-slate-600">Removing a device only deactivates it — it will reappear automatically if it reconnects via MQTT.</p>
        </div>

      </div>
    </AppShell>
  );
}
