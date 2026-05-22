"use client";

import { KeyRound, Plus, Shield, Trash2, UserCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";

interface User {
  id: string;
  username: string;
  role: string;
  active: boolean;
  createdAt: string;
}

const ROLES = ["admin", "technician", "viewer"] as const;
type Role = (typeof ROLES)[number];

const ROLE_BADGES: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700",
  technician: "bg-blue-100 text-blue-700",
  viewer: "bg-slate-100 text-slate-600",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Full access — manage users, rules, settings",
  technician: "Acknowledge alarms, view all data",
  viewer: "Read-only access",
};

const emptyForm = { username: "", password: "", role: "viewer" as Role };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [pwdModal, setPwdModal] = useState<{ id: string; username: string } | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [pwdError, setPwdError] = useState("");

  function reload() {
    setLoading(true);
    fetch("/api/users", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { users?: User[]; error?: string }) => {
        if (d.error) setError(d.error);
        else setUsers(d.users ?? []);
      })
      .catch(() => setError("Could not load users."))
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, []);

  async function createUser() {
    setSaving(true);
    setFormError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) { setFormError(data.error ?? "Failed to create user."); }
    else { setShowForm(false); setForm(emptyForm); reload(); }
    setSaving(false);
  }

  async function toggleActive(user: User) {
    await fetch(`/api/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !user.active }),
    });
    reload();
  }

  async function changeRole(user: User, role: string) {
    await fetch(`/api/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    reload();
  }

  async function deleteUser(user: User) {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    reload();
  }

  async function changePassword() {
    if (!pwdModal) return;
    setPwdError("");
    const res = await fetch(`/api/users/${pwdModal.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPwd }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) { setPwdError(data.error ?? "Failed."); }
    else { setPwdModal(null); setNewPwd(""); }
  }

  return (
    <AppShell activeNav="users">
      <div className="flex max-w-4xl flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-slate-500" />
            <h1 className="text-2xl font-bold text-slate-950">Users</h1>
          </div>
          <button
            className="flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={() => { setShowForm((v) => !v); setFormError(""); setForm(emptyForm); }}
            type="button"
          >
            <Plus size={15} /> Add user
          </button>
        </div>

        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {/* Role reference */}
        <div className="grid gap-3 sm:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${ROLE_BADGES[r]}`}>{r}</span>
              <p className="mt-1 text-xs text-slate-500">{ROLE_DESCRIPTIONS[r]}</p>
            </div>
          ))}
        </div>

        {showForm && (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold">New user</h2>
            {formError && <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{formError}</p>}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-500">Username</span>
                <input className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} autoComplete="off" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-500">Password (min 8 chars)</span>
                <input type="password" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-500">Role</span>
                <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={createUser} disabled={saving || !form.username || !form.password} type="button">
                {saving ? "Creating…" : "Create user"}
              </button>
              <button className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setShowForm(false)} type="button">Cancel</button>
            </div>
          </section>
        )}

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <p className="p-5 text-sm text-slate-400">Loading…</p>
          ) : users.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No DB users yet. Login uses env-var credentials.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={`border-b border-slate-100 ${!u.active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 font-semibold">{u.username}</td>
                    <td className="px-4 py-3">
                      <select
                        className={`rounded-full px-2 py-0.5 text-xs font-bold border-0 outline-none cursor-pointer ${ROLE_BADGES[u.role] ?? "bg-slate-100 text-slate-600"}`}
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value)}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(u)}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${u.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                        type="button"
                      >
                        <UserCheck size={10} />
                        {u.active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => { setPwdModal({ id: u.id, username: u.username }); setNewPwd(""); setPwdError(""); }} className="text-slate-400 hover:text-slate-700" type="button" title="Change password">
                          <KeyRound size={14} />
                        </button>
                        <button onClick={() => deleteUser(u)} className="text-red-400 hover:text-red-700" type="button" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold mb-1 flex items-center gap-1"><Shield size={14} /> Auth fallback</p>
          <p className="text-slate-500">If no DB users exist, login uses <code className="bg-slate-200 px-1 rounded text-xs">UPS_AUTH_USERNAME</code> / <code className="bg-slate-200 px-1 rounded text-xs">UPS_AUTH_PASSWORD_HASH</code> env vars. DB users take priority when present.</p>
        </div>
      </div>

      {/* Change password modal */}
      {pwdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-bold">Change password — {pwdModal.username}</h3>
            {pwdError && <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{pwdError}</p>}
            <input type="password" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="New password (min 8 chars)" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoFocus autoComplete="new-password" />
            <div className="mt-4 flex gap-2">
              <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={changePassword} disabled={newPwd.length < 8} type="button">Save</button>
              <button className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setPwdModal(null)} type="button">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
