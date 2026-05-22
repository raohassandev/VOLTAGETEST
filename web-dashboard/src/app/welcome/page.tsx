"use client";

import { Eye, FlaskConical, KeyRound, ShieldCheck, Wrench } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Role = "viewer" | "technician" | "admin" | "manufacturer";

interface RoleCard {
  role: Role;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  needsPassword: boolean;
}

const ROLES: RoleCard[] = [
  {
    role: "viewer",
    label: "Viewer",
    description: "View live UPS data and alarms. Read-only access.",
    icon: Eye,
    color: "text-slate-700",
    bg: "bg-slate-50",
    border: "border-slate-200",
    needsPassword: false,
  },
  {
    role: "technician",
    label: "Technician",
    description: "View data and acknowledge alarms on-site.",
    icon: Wrench,
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    needsPassword: false,
  },
  {
    role: "admin",
    label: "Admin",
    description: "Configure alarm rules, manage inventory, users, and settings.",
    icon: ShieldCheck,
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-200",
    needsPassword: true,
  },
  {
    role: "manufacturer",
    label: "Manufacturer",
    description: "Full access: calibration, system parameters, feature flags, history control.",
    icon: FlaskConical,
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    needsPassword: true,
  },
];

export default function WelcomePage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Role | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function selectRole(role: Role) {
    setSelected(role);
    setPassword("");
    setError("");
  }

  async function enter() {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/role-select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selected, password: password || undefined }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to authenticate.");
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  const card = ROLES.find((r) => r.role === selected);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#eef3f8] px-4 py-10 text-slate-950">
      {/* Header */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Image
          src="/brand/automatrix-logo.png"
          alt="Automatrix"
          width={64}
          height={64}
          className="object-contain"
          priority
        />
        <div>
          <h1 className="text-2xl font-bold text-slate-950 tracking-tight">UPS Monitoring System</h1>
          <p className="text-sm text-slate-500 mt-0.5">Industrial UPS Monitoring by Automatrix</p>
        </div>
      </div>

      {/* Role cards */}
      <div className="w-full max-w-2xl">
        <p className="mb-3 text-center text-sm font-semibold text-slate-500 uppercase tracking-wider">
          Login to access the system
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const isActive = selected === r.role;
            // Viewer / Technician are step-down roles only available after Admin login.
            // Show them greyed out so the UI isn't confusing to fresh users.
            const isStepDown = !r.needsPassword;
            return (
              <button
                key={r.role}
                onClick={() => !isStepDown && selectRole(r.role)}
                disabled={isStepDown}
                title={isStepDown ? "Login as Admin first, then switch role from the dashboard" : undefined}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all ${
                  isStepDown
                    ? "border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed"
                    : isActive
                    ? `${r.border} ${r.bg} shadow-md scale-[1.03] cursor-pointer`
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm cursor-pointer"
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isActive ? r.bg : "bg-slate-100"}`}>
                  <Icon size={20} className={isActive ? r.color : "text-slate-500"} />
                </div>
                <div>
                  <p className={`text-sm font-bold ${isActive ? r.color : "text-slate-700"}`}>{r.label}</p>
                  {r.needsPassword ? (
                    <span className="inline-flex items-center gap-0.5 mt-0.5 text-xs text-slate-400">
                      <KeyRound size={10} /> Password
                    </span>
                  ) : (
                    <span className="mt-0.5 text-xs text-slate-400">After login</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Description + password entry */}
        {card && (
          <div className={`mt-4 rounded-xl border ${card.border} ${card.bg} p-4`}>
            <p className="text-sm text-slate-600 mb-3">{card.description}</p>

            {card.needsPassword ? (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  {card.label} Password
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    autoFocus
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && enter()}
                    placeholder="Enter password…"
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-300"
                  />
                  <button
                    onClick={enter}
                    disabled={loading || !password}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                      card.role === "manufacturer"
                        ? "bg-amber-600 hover:bg-amber-700"
                        : "bg-violet-700 hover:bg-violet-800"
                    }`}
                  >
                    {loading ? "…" : "Enter"}
                  </button>
                </div>
                {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
              </div>
            ) : (
              <button
                onClick={enter}
                disabled={loading}
                className="w-full rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {loading ? "Entering…" : `Continue as ${card.label}`}
              </button>
            )}
          </div>
        )}
      </div>

      <p className="mt-8 text-xs text-slate-400">© {new Date().getFullYear()} Automatrix — UMS v1.0</p>
    </main>
  );
}
