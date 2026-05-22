"use client";

import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import type { UpsInventoryItem } from "@/lib/telemetry";
import type { UserRole } from "@/lib/auth";

function readRole(): UserRole {
  if (typeof document === "undefined") return "viewer";
  const m = document.cookie.match(/(?:^|;\s*)ups_user=([^;]*)/);
  if (!m) return "viewer";
  try { return (JSON.parse(atob(decodeURIComponent(m[1]))) as { role?: UserRole }).role ?? "viewer"; }
  catch { return "viewer"; }
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

export default function InventoryAdminPage() {
  const [inventory, setInventory] = useState<UpsInventoryItem[]>([]);
  const [form, setForm] = useState<UpsInventoryItem>(empty);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("viewer");

  useEffect(() => { setUserRole(readRole()); }, []);
  const canEdit = userRole === "admin" || userRole === "manufacturer";

  useEffect(() => {
    fetch("/api/inventory", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { inventory?: UpsInventoryItem[] }) => {
        if (Array.isArray(d.inventory)) setInventory(d.inventory);
      })
      .catch(() => undefined);
  }, []);

  function field(k: keyof UpsInventoryItem, v: string) {
    setForm((f) => ({
      ...f,
      [k]: k === "capacityVa" || k === "batteryNominalV" ? Number(v) : v,
    }));
  }

  async function save() {
    if (!form.upsId) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = (await res.json()) as { item?: UpsInventoryItem };
        const updated = { ...form, id: data.item?.id ?? form.id };
        setInventory((prev) => {
          const idx = prev.findIndex((i) => i.upsId === form.upsId);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = updated;
            return copy;
          }
          return [...prev, updated];
        });
        setForm(empty);
        setMsg("Saved.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(upsId: string) {
    if (!confirm(`Delete UPS "${upsId}"? This cannot be undone.`)) return;
    await fetch(`/api/inventory?upsId=${encodeURIComponent(upsId)}`, { method: "DELETE" });
    setInventory((prev) => prev.filter((i) => i.upsId !== upsId));
  }

  return (
    <AppShell activeNav="inventory">
      <div className="flex max-w-7xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">UPS Inventory</h1>
          <p className="text-sm text-slate-500">Manage UPS units, device associations, and site data.</p>
        </div>

        {canEdit && <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Add / update UPS</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="UPS ID *" value={form.upsId} onChange={(e) => field("upsId", e.target.value)} />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Device ID" value={form.deviceId} onChange={(e) => field("deviceId", e.target.value)} />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Serial" value={form.serial} onChange={(e) => field("serial", e.target.value)} />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Floor" value={form.floor} onChange={(e) => field("floor", e.target.value)} />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" placeholder="Location" value={form.location} onChange={(e) => field("location", e.target.value)} />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Capacity VA" type="number" value={form.capacityVa} onChange={(e) => field("capacityVa", e.target.value)} />
            <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Battery nominal V" type="number" value={form.batteryNominalV} onChange={(e) => field("batteryNominalV", e.target.value)} />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={save}
              disabled={saving || !form.upsId}
              type="button"
            >
              <Plus size={15} />
              {saving ? "Saving…" : "Save UPS"}
            </button>
            {msg && <span className="text-sm font-semibold text-emerald-700">{msg}</span>}
          </div>
        </section>}

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Registered UPS units ({inventory.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-3">UPS ID</th>
                  <th className="py-2 pr-3">Device ID</th>
                  <th className="py-2 pr-3">Serial</th>
                  <th className="py-2 pr-3">Location</th>
                  <th className="py-2 pr-3">Capacity</th>
                  <th className="py-2 pr-3">Battery V</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-2.5 pr-3 font-semibold">
                      <Link href={`/ups/${item.upsId}`} className="text-blue-700 hover:underline">
                        {item.upsId}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600">{item.deviceId || "--"}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{item.serial || "--"}</td>
                    <td className="py-2.5 pr-3">{[item.floor, item.location].filter(Boolean).join(" / ") || "--"}</td>
                    <td className="py-2.5 pr-3">{item.capacityVa.toLocaleString()} VA</td>
                    <td className="py-2.5 pr-3">{item.batteryNominalV} V</td>
                    <td className="py-2.5 pr-3">
                      {canEdit ? (
                        <div className="flex gap-2">
                          <button
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold"
                            onClick={() => setForm({ ...item })}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="inline-flex items-center rounded-md border border-red-200 px-2 py-1 text-red-700"
                            onClick={() => remove(item.upsId)}
                            type="button"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {inventory.length === 0 && (
                  <tr>
                    <td className="py-5 text-slate-400" colSpan={7}>
                      No UPS units registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
