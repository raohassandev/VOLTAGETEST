"use client";

import { ExternalLink, Cpu, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
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

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function BoardsPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/devices", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { devices?: Board[] }) => {
        setBoards(d.devices ?? []);
        setLastUpdated(new Date());
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const filtered = boards.filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      b.deviceId.toLowerCase().includes(q) ||
      (b.upsId ?? "").toLowerCase().includes(q) ||
      (b.mac ?? "").toLowerCase().includes(q) ||
      (b.ip ?? "").toLowerCase().includes(q) ||
      (b.firmware ?? "").toLowerCase().includes(q) ||
      (b.floor ?? "").toLowerCase().includes(q) ||
      (b.location ?? "").toLowerCase().includes(q)
    );
  });

  const online = boards.filter((b) => b.online).length;
  const offline = boards.length - online;
  const withFirmware = boards.filter((b) => b.firmware).length;
  const firmwareVersions = [...new Set(boards.map((b) => b.firmware).filter(Boolean))];

  return (
    <AppShell activeNav="boards">
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-slate-500" />
            <h1 className="text-2xl font-bold text-slate-950">Board Management</h1>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            type="button"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total boards", value: boards.length, color: "text-slate-700" },
            { label: "Online", value: online, color: "text-emerald-700" },
            { label: "Offline", value: offline, color: offline ? "text-red-700" : "text-slate-400" },
            { label: "Firmware versions", value: firmwareVersions.length, color: "text-blue-700" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{s.label}</p>
              <p className={`mt-0.5 text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Firmware summary */}
        {firmwareVersions.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Firmware versions in fleet</p>
            <div className="flex flex-wrap gap-2">
              {firmwareVersions.map((v) => {
                const count = boards.filter((b) => b.firmware === v).length;
                return (
                  <span key={v} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    v{v} <span className="text-slate-400">({count})</span>
                  </span>
                );
              })}
              {withFirmware < boards.length && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  Unknown ({boards.length - withFirmware})
                </span>
              )}
            </div>
          </div>
        )}

        {/* Search + table */}
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700">
              {filtered.length} board{filtered.length !== 1 ? "s" : ""}
              {lastUpdated && <span className="ml-2 text-xs font-normal text-slate-400">updated {timeAgo(lastUpdated.toISOString())}</span>}
            </p>
            <input
              className="w-48 rounded-md border border-slate-300 px-3 py-1.5 text-sm placeholder:text-slate-400"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <p className="p-8 text-center text-sm text-slate-400">Loading boards…</p>
          ) : filtered.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-400">No boards found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-4 py-3 w-40">Device ID</th>
                    <th className="px-4 py-3 w-28">UPS</th>
                    <th className="px-4 py-3 w-28">Location</th>
                    <th className="px-4 py-3 w-28">MAC</th>
                    <th className="px-4 py-3 w-28">IP / Portal</th>
                    <th className="px-4 py-3 w-24">Firmware</th>
                    <th className="px-4 py-3 w-20">Status</th>
                    <th className="px-4 py-3 w-24">Last seen</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b) => (
                    <tr key={b.deviceId} className={`border-b border-slate-100 transition-colors hover:bg-slate-50 ${!b.online ? "opacity-60" : ""}`}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-950">{b.deviceId}</td>
                      <td className="px-4 py-3 text-xs">
                        {b.upsId ? (
                          <span className="font-semibold text-slate-700">{b.upsId}</span>
                        ) : (
                          <span className="text-slate-400 italic">unassigned</span>
                        )}
                        {b.upsName && <p className="text-slate-400 truncate max-w-[100px]">{b.upsName}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {[b.floor, b.location].filter(Boolean).join(" / ") || "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{b.mac ?? "—"}</td>
                      <td className="px-4 py-3">
                        {b.ip ? (
                          <a href={`http://${b.ip}/`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-blue-700 hover:underline">
                            {b.ip} <ExternalLink size={10} />
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {b.firmware ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            v{b.firmware}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {b.online ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                            <Wifi size={10} /> Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
                            <WifiOff size={10} /> Offline
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{timeAgo(b.lastSeenAt)}</td>
                      <td className="px-4 py-3">
                        {b.ip ? (
                          <div className="flex gap-1">
                            <a href={`http://${b.ip}/config`} target="_blank" rel="noreferrer" className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200">Config</a>
                            <a href={`http://${b.ip}/data`} target="_blank" rel="noreferrer" className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200">Data</a>
                            <a href={`http://${b.ip}/update`} target="_blank" rel="noreferrer" className="rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100">OTA</a>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Board offline</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
          <p className="font-semibold text-slate-600 mb-1">OTA firmware update</p>
          <p>Click <span className="font-semibold">OTA</span> to open the board&apos;s built-in update page. Select the <code className="bg-slate-200 px-1 rounded">.bin</code> file and upload. The board will reboot automatically after flashing.</p>
        </div>
      </div>
    </AppShell>
  );
}
