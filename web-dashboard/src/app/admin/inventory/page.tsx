"use client";

import { Plus, Trash2, Pencil, X, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { checkUnauthorized } from "@/lib/handle-unauthorized";
import type { UpsInventoryItem } from "@/lib/telemetry";
import type { UserRole } from "@/lib/auth";

function readRole(): UserRole {
  if (typeof document === "undefined") return "viewer";
  const m = document.cookie.match(/(?:^|;\s*)ups_user=([^;]*)/);
  if (!m) return "viewer";
  try {
    const value = decodeURIComponent(m[1]);
    const payload = value.includes(".") ? value.slice(0, value.lastIndexOf(".")) : value;
    return (JSON.parse(atob(payload)) as { role?: UserRole }).role ?? "viewer";
  } catch { return "viewer"; }
}

const empty: UpsInventoryItem = {
  batteryNominalV: 48,
  capacityVa: 3000,
  deviceId: "",
  floor: "",
  id: "",
  location: "",
  serial: "",
  upsId: "",
};

const inputCls  = "w-full rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500 transition-colors";
const inputStyle = { background: "var(--surface-2)" };
const labelCls  = "text-xs font-semibold text-slate-400 uppercase tracking-wide";

// ── Modal ──────────────────────────────────────────────────────────────────────

function UpsModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: UpsInventoryItem;
  onClose: () => void;
  onSaved: (item: UpsInventoryItem) => void;
}) {
  const [form, setForm] = useState<UpsInventoryItem>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!initial.id;
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    // Close on Escape
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  function field(k: keyof UpsInventoryItem, v: string) {
    setForm((f) => ({ ...f, [k]: k === "capacityVa" || k === "batteryNominalV" ? Number(v) : v }));
  }

  async function save() {
    if (!form.upsId.trim()) { setError("UPS ID is required."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        setError(d.error ?? "Failed to save.");
        return;
      }
      const data = (await res.json()) as { item?: UpsInventoryItem };
      onSaved({ ...form, id: data.item?.id ?? form.id });
    } finally {
      setSaving(false);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div
        className="relative w-full max-w-2xl rounded-xl border border-slate-700 shadow-2xl"
        style={{ background: "var(--surface-1)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-cyan-400" />
            <h2 className="text-base font-bold text-white">{isEdit ? "Edit UPS" : "Add New UPS"}</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors" type="button">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>UPS ID <span className="text-red-400">*</span></span>
            <input ref={firstRef} className={inputCls} style={inputStyle}
              placeholder="e.g. UPS-FL3-A" value={form.upsId}
              onChange={(e) => field("upsId", e.target.value)}
              disabled={isEdit} />
            <span className="text-xs text-slate-600">Unique identifier shown on dashboard</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelCls}>Device ID</span>
            <input className={inputCls} style={inputStyle}
              placeholder="e.g. UMS-3076F5A5AD54" value={form.deviceId}
              onChange={(e) => field("deviceId", e.target.value)} />
            <span className="text-xs text-slate-600">ESP32 board device ID (links telemetry)</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelCls}>Serial Number</span>
            <input className={inputCls} style={inputStyle}
              placeholder="e.g. SN-2024-00142" value={form.serial}
              onChange={(e) => field("serial", e.target.value)} />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelCls}>Floor / Zone</span>
            <input className={inputCls} style={inputStyle}
              placeholder="e.g. Floor 3" value={form.floor}
              onChange={(e) => field("floor", e.target.value)} />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={labelCls}>Location / Room</span>
            <input className={inputCls} style={inputStyle}
              placeholder="e.g. Server Room B, Rack 4" value={form.location}
              onChange={(e) => field("location", e.target.value)} />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelCls}>Capacity (VA)</span>
            <input className={inputCls} style={inputStyle}
              placeholder="e.g. 3000" type="number" min={0} value={form.capacityVa}
              onChange={(e) => field("capacityVa", e.target.value)} />
            <span className="text-xs text-slate-600">Rated apparent power in volt-amps</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelCls}>Battery Nominal Voltage (V)</span>
            <input className={inputCls} style={inputStyle}
              placeholder="e.g. 48" type="number" min={0} value={form.batteryNominalV}
              onChange={(e) => field("batteryNominalV", e.target.value)} />
            <span className="text-xs text-slate-600">Battery bank nominal voltage</span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-700 px-6 py-4">
          {error
            ? <p className="text-sm text-red-400">{error}</p>
            : <span />}
          <div className="flex gap-2 ml-auto">
            <button
              className="rounded-md border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
              onClick={onClose} type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-md bg-cyan-700 hover:bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
              onClick={save} disabled={saving || !form.upsId.trim()} type="button"
            >
              {saving ? "Saving…" : isEdit ? "Save Changes" : <><Plus size={14} /> Add UPS</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function InventoryAdminPage() {
  const [inventory, setInventory] = useState<UpsInventoryItem[]>([]);
  const [modalItem, setModalItem] = useState<UpsInventoryItem | null>(null);
  const [userRole, setUserRole] = useState<UserRole>("viewer");

  useEffect(() => { setUserRole(readRole()); }, []);
  const canEdit = userRole === "admin" || userRole === "manufacturer";

  useEffect(() => {
    fetch("/api/inventory", { cache: "no-store" })
      .then((r) => { if (checkUnauthorized(r)) throw new Error("401"); return r.json(); })
      .then((d: { inventory?: UpsInventoryItem[] }) => {
        if (Array.isArray(d.inventory)) setInventory(d.inventory);
      })
      .catch(() => undefined);
  }, []);

  function onSaved(item: UpsInventoryItem) {
    setInventory((prev) => {
      const idx = prev.findIndex((i) => i.upsId === item.upsId);
      if (idx >= 0) { const copy = [...prev]; copy[idx] = item; return copy; }
      return [...prev, item];
    });
    setModalItem(null);
  }

  async function remove(upsId: string) {
    if (!confirm(`Delete UPS "${upsId}"?\n\nThis cannot be undone.`)) return;
    await fetch(`/api/inventory?upsId=${encodeURIComponent(upsId)}`, { method: "DELETE" });
    setInventory((prev) => prev.filter((i) => i.upsId !== upsId));
  }

  return (
    <AppShell activeNav="inventory">
      <div className="flex max-w-7xl flex-col gap-5 iot-page">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">UPS Inventory</h1>
            <p className="text-sm text-slate-400">Manage UPS units, device associations, and site data.</p>
          </div>
          {canEdit && (
            <button
              className="inline-flex items-center gap-2 rounded-md bg-cyan-700 hover:bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition-colors"
              onClick={() => setModalItem(empty)}
              type="button"
            >
              <Plus size={15} /> Add UPS
            </button>
          )}
        </div>

        {/* Table */}
        <section className="rounded-lg border border-slate-700" style={{ background: "var(--surface-1)" }}>
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="text-base font-semibold text-white">Registered UPS units ({inventory.length})</h2>
          </div>

          {/* Mobile */}
          <div className="divide-y divide-slate-800 sm:hidden">
            {inventory.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No UPS units registered yet.</p>
            ) : inventory.map((item) => (
              <div key={item.id} className="p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/ups/${item.upsId}`} className="text-sm font-bold text-cyan-400 hover:underline">{item.upsId}</Link>
                  {canEdit && (
                    <div className="flex gap-2 shrink-0">
                      <button className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-700 transition-colors" onClick={() => setModalItem({ ...item })} type="button">
                        <Pencil size={11} className="inline mr-1" />Edit
                      </button>
                      <button className="inline-flex items-center rounded border border-red-800 px-2 py-0.5 text-red-400 hover:bg-red-900/30 transition-colors" onClick={() => remove(item.upsId)} type="button"><Trash2 size={12} /></button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-slate-500">Device ID</span>
                  <span className="font-mono text-slate-300">{item.deviceId || "—"}</span>
                  <span className="text-slate-500">Serial</span>
                  <span className="text-slate-300">{item.serial || "—"}</span>
                  <span className="text-slate-500">Location</span>
                  <span className="text-slate-300">{[item.floor, item.location].filter(Boolean).join(" / ") || "—"}</span>
                  <span className="text-slate-500">Capacity</span>
                  <span className="text-slate-300">{item.capacityVa.toLocaleString()} VA</span>
                  <span className="text-slate-500">Battery V</span>
                  <span className="text-slate-300">{item.batteryNominalV} V</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="py-3 pr-3 pl-5">UPS ID</th>
                  <th className="py-3 pr-3">Device ID</th>
                  <th className="py-3 pr-3">Serial</th>
                  <th className="py-3 pr-3">Location</th>
                  <th className="py-3 pr-3">Capacity</th>
                  <th className="py-3 pr-3">Battery V</th>
                  <th className="py-3 pr-5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => (
                  <tr key={item.id} className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 pr-3 pl-5 font-semibold">
                      <Link href={`/ups/${item.upsId}`} className="text-cyan-400 hover:underline">{item.upsId}</Link>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-400 font-mono text-xs">{item.deviceId || "—"}</td>
                    <td className="py-2.5 pr-3 text-slate-400">{item.serial || "—"}</td>
                    <td className="py-2.5 pr-3 text-slate-300">{[item.floor, item.location].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="py-2.5 pr-3 text-slate-300">{item.capacityVa.toLocaleString()} VA</td>
                    <td className="py-2.5 pr-3 text-slate-300">{item.batteryNominalV} V</td>
                    <td className="py-2.5 pr-5">
                      {canEdit ? (
                        <div className="flex gap-2">
                          <button
                            className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
                            onClick={() => setModalItem({ ...item })} type="button"
                          >
                            <Pencil size={12} /> Edit
                          </button>
                          <button
                            className="inline-flex items-center rounded-md border border-red-800 px-2 py-1 text-red-400 hover:bg-red-900/30 transition-colors"
                            onClick={() => remove(item.upsId)} type="button"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ) : <span className="text-xs text-slate-600">—</span>}
                    </td>
                  </tr>
                ))}
                {inventory.length === 0 && (
                  <tr><td className="py-5 pl-5 text-slate-500" colSpan={7}>No UPS units registered yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Modal */}
      {modalItem && (
        <UpsModal
          initial={modalItem}
          onClose={() => setModalItem(null)}
          onSaved={onSaved}
        />
      )}
    </AppShell>
  );
}
