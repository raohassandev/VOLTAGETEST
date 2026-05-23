"use client";

import { Eye, FlaskConical, KeyRound, ShieldCheck, Wrench, Zap } from "lucide-react";
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
  glow: string;
  needsPassword: boolean;
}

const ROLES: RoleCard[] = [
  {
    role: "viewer",
    label: "Viewer",
    description: "View live UPS data and alarms. Read-only access.",
    icon: Eye,
    color: "text-slate-300",
    bg: "bg-slate-800/60",
    border: "border-slate-600",
    glow: "rgba(100,116,139,0.3)",
    needsPassword: false,
  },
  {
    role: "technician",
    label: "Technician",
    description: "View data and acknowledge alarms on-site.",
    icon: Wrench,
    color: "text-cyan-300",
    bg: "bg-cyan-900/40",
    border: "border-cyan-700",
    glow: "rgba(6,182,212,0.3)",
    needsPassword: false,
  },
  {
    role: "admin",
    label: "Admin",
    description: "Configure alarm rules, manage inventory, users, and settings.",
    icon: ShieldCheck,
    color: "text-violet-300",
    bg: "bg-violet-900/40",
    border: "border-violet-700",
    glow: "rgba(139,92,246,0.3)",
    needsPassword: true,
  },
  {
    role: "manufacturer",
    label: "Manufacturer",
    description: "Full access: calibration, system parameters, feature flags, history.",
    icon: FlaskConical,
    color: "text-amber-300",
    bg: "bg-amber-900/40",
    border: "border-amber-700",
    glow: "rgba(245,158,11,0.3)",
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
    <main
      className="flex min-h-screen flex-col items-center justify-center px-4 py-10"
      style={{ background: "var(--background)" }}
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none fixed top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-3xl opacity-10"
        style={{ background: "var(--cyan-500)" }}
      />

      {/* Header */}
      <div className="relative mb-10 flex flex-col items-center gap-4 text-center">
        <div className="relative">
          <Image
            src="/brand/automatrix-logo.png"
            alt="Automatrix"
            width={72}
            height={72}
            className="object-contain relative z-10"
            priority
          />
          <div
            className="absolute inset-0 rounded-full blur-2xl opacity-40"
            style={{ background: "var(--cyan-500)" }}
          />
        </div>
        <div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <Zap size={18} className="text-cyan-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">UPS Monitoring System</h1>
          </div>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Industrial UPS Monitoring · Automatrix
          </p>
        </div>
      </div>

      {/* Role selector */}
      <div className="relative w-full max-w-2xl">
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          Select your access level to continue
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const isActive = selected === r.role;
            const isStepDown = !r.needsPassword;
            return (
              <button
                key={r.role}
                onClick={() => !isStepDown && selectRole(r.role)}
                disabled={isStepDown}
                title={isStepDown ? "Login as Admin first, then switch role from the dashboard" : undefined}
                className={`flex flex-col items-center gap-3 rounded-xl border-2 p-5 text-center transition-all duration-200 ${
                  isStepDown
                    ? "border-slate-800 opacity-30 cursor-not-allowed"
                    : isActive
                    ? `${r.border} ${r.bg} scale-[1.04] cursor-pointer`
                    : "border-slate-700 bg-slate-900/60 hover:border-slate-600 hover:bg-slate-800/60 cursor-pointer hover:scale-[1.02]"
                }`}
                style={isActive ? { boxShadow: `0 0 24px ${r.glow}` } : undefined}
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                    isActive ? `${r.bg} ${r.border}` : "bg-slate-800 border-slate-700"
                  }`}
                >
                  <Icon size={22} className={isActive ? r.color : "text-slate-500"} />
                </div>
                <div>
                  <p className={`text-sm font-bold ${isActive ? r.color : "text-slate-400"}`}>{r.label}</p>
                  {r.needsPassword ? (
                    <span className="inline-flex items-center gap-0.5 mt-1 text-xs text-slate-500">
                      <KeyRound size={10} /> Password
                    </span>
                  ) : (
                    <span className="mt-1 text-xs text-slate-600">After login</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Password / confirm panel */}
        {card && (
          <div
            className={`mt-4 rounded-xl border-2 p-5 transition-all ${card.border}`}
            style={{
              background: "var(--surface-2)",
              boxShadow: `0 0 20px ${card.glow}`,
            }}
          >
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>{card.description}</p>

            {card.needsPassword ? (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
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
                    className="flex-1 rounded-lg border px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-cyan-500 placeholder:text-slate-600"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}
                  />
                  <button
                    onClick={enter}
                    disabled={loading || !password}
                    className={`rounded-lg px-5 py-2 text-sm font-bold text-white transition-all disabled:opacity-40 hover:brightness-110 ${
                      card.role === "manufacturer"
                        ? "bg-amber-600"
                        : "bg-violet-600"
                    }`}
                  >
                    {loading ? "…" : "Enter"}
                  </button>
                </div>
                {error && <p className="text-xs font-semibold text-red-400">{error}</p>}
              </div>
            ) : (
              <button
                onClick={enter}
                disabled={loading}
                className="w-full rounded-lg bg-cyan-600 hover:bg-cyan-500 py-2.5 text-sm font-bold text-white disabled:opacity-40 transition-colors"
              >
                {loading ? "Entering…" : `Continue as ${card.label}`}
              </button>
            )}
          </div>
        )}
      </div>

      <p className="mt-10 text-xs" style={{ color: "var(--text-muted)" }}>
        © {new Date().getFullYear()} Automatrix — UMS v0.2
      </p>
    </main>
  );
}
