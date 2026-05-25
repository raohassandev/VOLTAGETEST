"use client";

import {
  Bell,
  ChevronDown,
  Eye,
  FlaskConical,
  KeyRound,
  LogOut,
  Menu,
  ShieldCheck,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { checkUnauthorized } from "@/lib/handle-unauthorized";
import type { UserRole } from "@/lib/auth";

export type NavItem =
  | "dashboard"
  | "alarms"
  | "inventory"
  | "alarm-rules"
  | "boards"
  | "license"
  | "settings"
  | "users"
  | "system"
  | "calibration";

interface AppShellProps {
  children: React.ReactNode;
  activeNav?: NavItem;
}

interface NavLink {
  key: NavItem;
  label: string;
  href: string;
  minRole: UserRole;
}

const NAV_LINKS: NavLink[] = [
  { key: "dashboard",   label: "Dashboard",  href: "/",                  minRole: "viewer" },
  { key: "alarms",      label: "Alarms",     href: "/alarms",            minRole: "viewer" },
  { key: "inventory",   label: "Inventory",  href: "/admin/inventory",   minRole: "admin" },
  { key: "alarm-rules", label: "Rules",      href: "/admin/alarm-rules", minRole: "admin" },
  { key: "boards",      label: "Boards",     href: "/admin/boards",      minRole: "manufacturer" },
  { key: "license",     label: "License",    href: "/admin/license",     minRole: "manufacturer" },
  { key: "settings",    label: "Settings",   href: "/admin/settings",    minRole: "manufacturer" },
  { key: "users",       label: "Users",      href: "/admin/users",       minRole: "manufacturer" },
  { key: "system",      label: "System",     href: "/admin/system",      minRole: "manufacturer" },
];

const ROLE_RANK: Record<UserRole, number> = {
  viewer: 0,
  technician: 1,
  admin: 2,
  manufacturer: 3,
};

const ROLE_META: Record<UserRole, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  viewer:       { label: "Viewer",       color: "text-slate-300",  bg: "bg-slate-800",    border: "border-slate-600",  icon: Eye },
  technician:   { label: "Technician",   color: "text-cyan-300",   bg: "bg-cyan-900/60",  border: "border-cyan-700",   icon: Wrench },
  admin:        { label: "Admin",        color: "text-violet-300", bg: "bg-violet-900/60",border: "border-violet-700", icon: ShieldCheck },
  manufacturer: { label: "Manufacturer", color: "text-amber-300",  bg: "bg-amber-900/60", border: "border-amber-700",  icon: FlaskConical },
};

const PASSWORD_ROLES = new Set<UserRole>(["admin", "manufacturer"]);

function readRoleCookie(): UserRole {
  if (typeof document === "undefined") return "viewer";
  const match = document.cookie.match(/(?:^|;\s*)ups_user=([^;]*)/);
  if (!match) return "viewer";
  try {
    const value = decodeURIComponent(match[1]);
    const payload = value.includes(".") ? value.slice(0, value.lastIndexOf(".")) : value;
    const parsed = JSON.parse(atob(payload)) as { role?: UserRole };
    return parsed.role ?? "viewer";
  } catch {
    return "viewer";
  }
}

function canAccess(userRole: UserRole, minRole: UserRole): boolean {
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[minRole] ?? 0);
}

// ── Role switcher modal ───────────────────────────────────────────────────────

function RoleSwitcher({ currentRole, onClose }: { currentRole: UserRole; onClose: () => void }) {
  const router = useRouter();
  const [selected, setSelected] = useState<UserRole | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  async function switchRole() {
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
        setError(data.error ?? "Authentication failed.");
        setLoading(false);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError("Network error.");
      setLoading(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={(e) => e.target === overlayRef.current && onClose()}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-0 sm:px-4"
    >
      <div
        className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-slate-700 shadow-2xl p-5 pb-8 sm:pb-5"
        style={{ background: "var(--surface-2)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-cyan-400" />
            <h2 className="font-bold text-slate-100">Switch Role</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {(Object.keys(ROLE_META) as UserRole[]).map((r) => {
            const m = ROLE_META[r];
            const Icon = m.icon;
            const isActive = selected === r;
            const isCurrent = r === currentRole;
            return (
              <button
                key={r}
                onClick={() => { setSelected(r); setPassword(""); setError(""); }}
                className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-all ${
                  isActive
                    ? `${m.bg} ${m.border} ${m.color} shadow-lg`
                    : "border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800"
                }`}
              >
                <Icon size={16} className={isActive ? m.color : "text-slate-500"} />
                <div>
                  <p className={`text-xs font-bold ${isActive ? m.color : "text-slate-300"}`}>{m.label}</p>
                  {isCurrent && <p className="text-[10px] text-slate-500">current</p>}
                </div>
              </button>
            );
          })}
        </div>

        {selected && (
          <>
            {PASSWORD_ROLES.has(selected) ? (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                  <KeyRound size={11} /> {ROLE_META[selected].label} Password
                </label>
                <input
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && switchRole()}
                  placeholder="Enter password…"
                  className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-colors placeholder:text-slate-600"
                />
                {error && <p className="text-xs text-red-400 font-semibold">{error}</p>}
                <button
                  onClick={switchRole}
                  disabled={loading || !password}
                  className="rounded-lg py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-40 bg-cyan-600 hover:bg-cyan-500 disabled:cursor-not-allowed"
                >
                  {loading ? "Authenticating…" : `Switch to ${ROLE_META[selected].label}`}
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-400 mb-3">
                  Operator-mode switch — no re-authentication required.
                </p>
                {error && <p className="text-xs text-red-400 font-semibold mb-2">{error}</p>}
                <button
                  onClick={switchRole}
                  disabled={loading}
                  className="w-full rounded-lg bg-cyan-600 hover:bg-cyan-500 py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition-colors"
                >
                  {loading ? "Switching…" : `Continue as ${ROLE_META[selected].label}`}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── AppShell ──────────────────────────────────────────────────────────────────

export default function AppShell({ children, activeNav }: AppShellProps) {
  const [alarmCount, setAlarmCount] = useState(0);
  const [apiStatus, setApiStatus]   = useState<"ok" | "degraded" | "unknown">("unknown");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [userRole, setUserRole]     = useState<UserRole>("viewer");

  useEffect(() => {
    setUserRole(readRoleCookie()); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [alarmsRes, healthRes] = await Promise.all([
          fetch("/api/alarms?state=active&limit=100", { cache: "no-store" }),
          fetch("/api/health", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (checkUnauthorized(alarmsRes)) return;
        if (alarmsRes.ok) {
          const d = (await alarmsRes.json()) as { alarms?: unknown[] };
          if (!cancelled) setAlarmCount(d.alarms?.length ?? 0);
        }
        if (!cancelled) setApiStatus(healthRes.ok ? "ok" : "degraded");
      } catch {
        if (!cancelled) setApiStatus("degraded");
      }
    }

    poll();
    const t = window.setInterval(poll, 15_000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileOpen(false);
  }, [activeNav]);

  const visibleLinks = NAV_LINKS.filter((l) => canAccess(userRole, l.minRole));
  const meta = ROLE_META[userRole];
  const RoleIcon = meta.icon;

  return (
    <div className="min-h-screen text-slate-100" style={{ background: "var(--background)" }}>
      {showSwitcher && (
        <RoleSwitcher
          currentRole={userRole}
          onClose={() => { setShowSwitcher(false); setUserRole(readRoleCookie()); }}
        />
      )}

      {/* Sticky top navbar */}
      <header
        className="sticky top-0 z-30 border-b"
        style={{
          background: "rgba(17, 24, 39, 0.95)",
          borderColor: "var(--border-subtle)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:px-6 lg:px-8">

          {/* Brand */}
          <Link href="/" className="flex shrink-0 items-center gap-2 mr-2" onClick={() => setMobileOpen(false)}>
            <div className="relative">
              <Image
                src="/brand/automatrix-logo.png"
                alt="Automatrix"
                width={32}
                height={32}
                className="shrink-0 object-contain"
                priority
              />
              <div
                className="absolute inset-0 rounded-full blur-md opacity-40 pointer-events-none"
                style={{ background: "var(--cyan-500)" }}
              />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-bold text-sm text-white tracking-tight">UMS</span>
              <span className="hidden text-[10px] font-normal lg:block" style={{ color: "var(--text-secondary)" }}>
                UPS Monitoring
              </span>
            </div>
          </Link>

          {/* Divider */}
          <div className="hidden md:block h-5 w-px mx-1" style={{ background: "var(--border-subtle)" }} />

          {/* Desktop nav — scrollable so all links are reachable even on small laptops */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-hide">
            {visibleLinks.map(({ key, label, href }) => (
              <Link
                key={key}
                href={href}
                className={`rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-all ${
                  activeNav === key
                    ? "text-cyan-300 bg-cyan-900/30 border border-cyan-800/60"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Right controls */}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">

            {/* API status — hidden on xs */}
            <span
              className={`hidden sm:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold border ${
                apiStatus === "ok"
                  ? "text-emerald-400 bg-emerald-900/30 border-emerald-800"
                  : apiStatus === "degraded"
                  ? "text-red-400 bg-red-900/30 border-red-800"
                  : "text-slate-500 bg-slate-800/30 border-slate-700"
              }`}
            >
              <span
                className={`status-dot ${
                  apiStatus === "ok" ? "online iot-pulse" : apiStatus === "degraded" ? "critical" : "offline"
                }`}
                style={{ width: "6px", height: "6px" }}
              />
              {apiStatus === "ok" ? "Live" : apiStatus === "degraded" ? "Degraded" : "—"}
            </span>

            {/* Alarm count — always visible */}
            <Link
              href="/alarms"
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold transition-all border ${
                alarmCount > 0
                  ? "bg-red-900/40 text-red-300 border-red-700 hover:bg-red-900/60"
                  : "bg-slate-800/40 text-slate-400 border-slate-700 hover:bg-slate-800/60"
              }`}
              onClick={() => setMobileOpen(false)}
            >
              <Bell size={11} className={alarmCount > 0 ? "iot-blink" : ""} />
              <span>{alarmCount}</span>
            </Link>

            {/* Role badge — hidden on xs, tap to switch */}
            <button
              onClick={() => { setMobileOpen(false); setShowSwitcher(true); }}
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all hover:opacity-90 ${meta.bg} ${meta.color} ${meta.border}`}
              title="Switch role"
            >
              <RoleIcon size={11} />
              <span className="hidden lg:inline">{meta.label}</span>
              <ChevronDown size={10} className="opacity-60" />
            </button>

            {/* Logout — hidden on xs */}
            <form action="/api/logout" method="post" className="hidden sm:block">
              <button
                className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs font-semibold text-slate-400 hover:border-slate-600 hover:text-slate-200 transition-colors"
                type="submit"
              >
                <LogOut size={11} />
                <span className="hidden lg:inline">Exit</span>
              </button>
            </form>

            {/* Mobile hamburger */}
            <button
              className="flex md:hidden items-center justify-center rounded-md border border-slate-700 bg-slate-800/60 p-1.5 text-slate-400 hover:text-slate-200 transition-colors"
              onClick={() => setMobileOpen((v) => !v)}
              type="button"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div
            className="border-t md:hidden"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
          >
            {/* Nav links */}
            <nav className="flex flex-col gap-0.5 px-3 pt-2 pb-1">
              {visibleLinks.map(({ key, label, href }) => (
                <Link
                  key={key}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    activeNav === key
                      ? "bg-cyan-900/40 text-cyan-300 border border-cyan-800"
                      : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </nav>

            {/* Role + status row */}
            <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-800">
              <button
                onClick={() => { setMobileOpen(false); setShowSwitcher(true); }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold flex-1 ${meta.bg} ${meta.color} ${meta.border}`}
              >
                <RoleIcon size={14} />
                {meta.label} <ChevronDown size={12} className="ml-auto opacity-60" />
              </button>
              {/* API status on mobile */}
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold border ${
                  apiStatus === "ok"
                    ? "text-emerald-400 bg-emerald-900/30 border-emerald-800"
                    : apiStatus === "degraded"
                    ? "text-red-400 bg-red-900/30 border-red-800"
                    : "text-slate-500 bg-slate-800/30 border-slate-700"
                }`}
              >
                <span
                  className={`status-dot ${apiStatus === "ok" ? "online iot-pulse" : apiStatus === "degraded" ? "critical" : "offline"}`}
                  style={{ width: "6px", height: "6px" }}
                />
                {apiStatus === "ok" ? "Live" : "—"}
              </span>
            </div>

            {/* Logout */}
            <div className="px-3 pb-3">
              <form action="/api/logout" method="post">
                <button
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/40 py-2.5 text-sm font-semibold text-slate-400 hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5"
                  type="submit"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        )}
      </header>

      {/* Page content */}
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-5 lg:px-8 iot-page">
        {children}
      </div>
    </div>
  );
}
