"use client";

import { AlertTriangle, Eye, FlaskConical, KeyRound, ShieldCheck, Wrench, Zap } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

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
    description: "Full access: licensing, boards, calibration, system parameters, and feature flags.",
    icon: FlaskConical,
    color: "text-amber-300",
    bg: "bg-amber-900/40",
    border: "border-amber-700",
    glow: "rgba(245,158,11,0.3)",
    needsPassword: true,
  },
];

function WelcomePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get("expired") === "1";
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
      {sessionExpired && (
        <div className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-amber-700 bg-amber-900/80 px-4 py-2.5 text-sm font-semibold text-amber-200 shadow-xl backdrop-blur-sm">
          <AlertTriangle size={15} className="shrink-0 text-amber-400" />
          Your session has expired. Please sign in again.
        </div>
      )}

      <div className="relative mb-10 flex flex-col items-center gap-4 text-center">
        <div className="relative flex h-28 w-28 items-center justify-center rounded-3xl border border-cyan-500/30 bg-slate-950 shadow-2xl shadow-cyan-950/40">
          <Image
            src="/brand/automatrix-logo.png"
            alt="Automatrix Engineering"
            width={98}
            height={98}
            className="object-contain"
            priority
          />
        </div>
        <div>
          <p className="text-base font-bold text-white">Automatrix Engineering</p>
          <div className="mb-1 mt-1 flex items-center justify-center gap-2">
            <Zap size={18} className="text-cyan-400" />
            <h1 className="text-3xl font-bold tracking-tight text-cyan-200">VOLTAGETEST / UMS</h1>
          </div>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Industrial UPS Monitoring
          </p>
        </div>
      </div>

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
                    ? "cursor-not-allowed border-slate-800 opacity-30"
                    : isActive
                    ? `${r.border} ${r.bg} scale-[1.04] cursor-pointer`
                    : "cursor-pointer border-slate-700 bg-slate-900/60 hover:scale-[1.02] hover:border-slate-600 hover:bg-slate-800/60"
                }`}
                style={isActive ? { boxShadow: `0 0 24px ${r.glow}` } : undefined}
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl border ${isActive ? `${r.bg} ${r.border}` : "border-slate-700 bg-slate-800"}`}>
                  <Icon size={22} className={isActive ? r.color : "text-slate-500"} />
                </div>
                <div>
                  <p className={`text-sm font-bold ${isActive ? r.color : "text-slate-400"}`}>{r.label}</p>
                  {r.needsPassword ? (
                    <span className="mt-1 inline-flex items-center gap-0.5 text-xs text-slate-500">
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

        {card && (
          <div
            className={`mt-4 rounded-xl border-2 p-5 transition-all ${card.border}`}
            style={{ background: "var(--surface-2)", boxShadow: `0 0 20px ${card.glow}` }}
          >
            <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>{card.description}</p>
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
                  placeholder="Enter password"
                  className="flex-1 rounded-lg border px-3 py-2 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-500"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}
                />
                <button
                  onClick={enter}
                  disabled={loading || !password}
                  className={`rounded-lg px-5 py-2 text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-40 ${
                    card.role === "manufacturer" ? "bg-amber-600" : "bg-violet-600"
                  }`}
                >
                  {loading ? "..." : "Enter"}
                </button>
              </div>
              {error && <p className="text-xs font-semibold text-red-400">{error}</p>}
            </div>
          </div>
        )}
      </div>

      <p className="mt-10 text-xs" style={{ color: "var(--text-muted)" }}>
        (c) {new Date().getFullYear()} Automatrix Engineering - VOLTAGETEST / UMS v2.1.0
      </p>
    </main>
  );
}

export default function WelcomePage() {
  return (
    <Suspense>
      <WelcomePageInner />
    </Suspense>
  );
}
