"use client";

import { Cpu, ExternalLink, Radio, RefreshCw, Search, Wifi, WifiOff, Zap } from "lucide-react";
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
      Commands disabled — firmware not ready
    </span>
  );
}

export default function BoardsPage() {
  const [boards, setBoards]         = useState<Board[]>([]);
  const [discovered, setDiscovered] = useState<Discovered[]>([]);
  const [tab, setTab]               = useState<Tab>("mqtt");
  const [search, setSearch]         = useState("");
  const [loading, setLoading]       = useState(true);
  const [scanning, setScanning]     = useState(false);
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
      <div className="flex flex-col gap-5 iot-page">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-cyan-500" />
            <h1 className="text-2xl font-bold text-white">Board Management</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={triggerScan} disabled={scanning}
              className="flex items-center gap-1.5 rounded-md border border-slate-600 px-3 py-1.5 text-sm font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors">
              <Search size={14} className={scanning ? "animate-pulse" : ""} />
              {scanning ? "Scanning…" : "Scan LAN"}
            </button>
            <button onClick={loadAll} disabled={loading}
              className="flex items-center gap-1.5 rounded-md border border-slate-600 px-3 py-1.5 text-sm font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "MQTT Connected", value: mqttOnline,  border: "border-emerald-800", textColor: "text-emerald-400" },
            { label: "MQTT Offline",   value: mqttOffline, border: mqttOffline ? "border-red-800" : "border-slate-700", textColor: mqttOffline ? "text-red-400" : "text-slate-500" },
            { label: "LAN Discovered", value: discovered.filter((d) => d.boardConfirmed).length, border: "border-cyan-900", textColor: "text-cyan-400" },
            { label: "Unregistered",   value: discNew,     border: discNew ? "border-amber-800" : "border-slate-700", textColor: discNew ? "text-amber-400" : "text-slate-500" },
          ].map((s) => (
            <div key={s.label} className={`rounded-lg border ${s.border} p-4`} style={{ background: "var(--surface-1)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{s.label}</p>
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
        <div className="rounded-lg border border-amber-800 bg-amber-900/20 px-4 py-2.5 text-xs text-amber-300 flex items-center gap-2">
          <span className="font-bold text-amber-400">Note:</span>
          Reboot / Reset kWh buttons publish MQTT commands to the board. Command delivery requires firmware that subscribes to <code className="font-mono bg-amber-900/40 px-1 rounded">ums/devices/&#123;id&#125;/command</code>. Current firmware does not yet handle this topic.
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-700">
          {([
            { key: "mqtt",       label: `MQTT Boards (${mqttOnline} online${mqttOffline ? ` / ${boards.length} total` : ""})` },
            { key: "discovered", label: `LAN Discovered (${discovered.filter((d) => d.boardConfirmed).length})` },
            { key: "all",        label: "All" },
          ] as { key: Tab; label: string }[]).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === t.key ? "border-cyan-500 text-cyan-300" : "border-transparent text-slate-500 hover:text-slate-300"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <input
            className="w-64 rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-600 transition-colors"
            style={{ background: "var(--surface-2)" }}
            placeholder="Search by ID, IP, MAC…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {lastUpdated && (
            <span className="text-xs text-slate-600">Updated {timeAgo(lastUpdated.toISOString())}</span>
          )}
        </div>

        {/* MQTT Boards tab */}
        {(tab === "mqtt" || tab === "all") && (
          <section className="rounded-lg border" style={sectionStyle}>
            <div className="border-b border-slate-700 px-4 py-3 flex items-center gap-2">
              <Zap size={14} className="text-emerald-400" />
              <p className="text-sm font-semibold text-slate-300">Registered MQTT Boards</p>
            </div>
            {loading ? (
              <p className="p-8 text-center text-sm text-slate-500">Loading…</p>
            ) : filteredBoards.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">No boards found. Start the MQTT broker and connect a board.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Device ID</th>
                      <th className="px-4 py-3">UPS</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">IP</th>
                      <th className="px-4 py-3">MAC</th>
                      <th className="px-4 py-3">Firmware</th>
                      <th className="px-4 py-3">Signal</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Last seen</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBoards.map((b) => (
                      <tr key={b.deviceId} className={`border-b border-slate-800 hover:bg-slate-800/40 transition-colors ${!b.online ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-200">{b.deviceId}</td>
                        <td className="px-4 py-3 text-xs">
                          {b.upsId
                            ? <span className="font-semibold text-cyan-400">{b.upsId}</span>
                            : <span className="text-slate-500 italic">unassigned</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
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
                        <td className="px-4 py-3"><span className="text-xs text-slate-600">—</span></td>
                        <td className="px-4 py-3">
                          {b.online
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 border border-emerald-800 px-2 py-0.5 text-xs font-bold text-emerald-400"><Wifi size={10} /> Online</span>
                            : <span className="inline-flex items-center gap-1 rounded-full bg-slate-700 border border-slate-600 px-2 py-0.5 text-xs font-bold text-slate-400"><WifiOff size={10} /> Offline</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{timeAgo(b.lastSeenAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {b.ip && <>
                              <a href={`http://${b.ip}/config`} target="_blank" rel="noreferrer"
                                className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-600">Config</a>
                              <a href={`http://${b.ip}/update`} target="_blank" rel="noreferrer"
                                className="rounded bg-cyan-900/50 border border-cyan-800 px-2 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/70">OTA</a>
                            </>}
                            {b.online && <CommandBtn deviceId={b.deviceId} />}
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

        {/* LAN Discovered tab */}
        {(tab === "discovered" || tab === "all") && (
          <section className="rounded-lg border" style={sectionStyle}>
            <div className="border-b border-slate-700 px-4 py-3 flex items-center gap-2">
              <Radio size={14} className="text-cyan-500" />
              <p className="text-sm font-semibold text-slate-300">LAN Discovered Boards</p>
              <span className="text-xs text-slate-600 ml-1">— found by ARP scan, not yet connected via MQTT</span>
            </div>
            {filteredDisc.filter((d) => d.boardConfirmed).length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-slate-500">No boards discovered on LAN yet.</p>
                <p className="text-xs text-slate-600 mt-1">Click <strong className="text-slate-400">Scan LAN</strong> to search, or wait for the automatic 5-minute scan.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">IP Address</th>
                      <th className="px-4 py-3">MAC</th>
                      <th className="px-4 py-3">Device ID</th>
                      <th className="px-4 py-3">Firmware</th>
                      <th className="px-4 py-3">Last seen on LAN</th>
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
                              Open Board
                            </a>
                            <a href={`http://${d.ip}/config`} target="_blank" rel="noreferrer"
                              className="rounded bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-600">
                              Configure
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
          <p>Make sure the board is configured to connect to MQTT broker at <code className="bg-slate-700 px-1 rounded text-slate-300">ums-server.local:1883</code> or <code className="bg-slate-700 px-1 rounded text-slate-300">192.168.0.111:1883</code>. Open the board config page via its IP address and update the broker URL. Then click <strong className="text-slate-300">Scan LAN</strong> to find it.</p>
        </div>

      </div>
    </AppShell>
  );
}
