"use client";

import {
  Activity,
  Bell,
  ChevronDown,
  Eye,
  FlaskConical,
  KeyRound,
  LogOut,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { UserRole } from "@/lib/auth";

export type NavItem =
  | "dashboard"
  | "alarms"
  | "inventory"
  | "alarm-rules"
  | "boards"
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
  { key: "dashboard",   label: "Dashboard",    href: "/",                    minRole: "viewer" },
  { key: "alarms",      label: "Alarms",        href: "/alarms",              minRole: "viewer" },
  { key: "inventory",   label: "Inventory",     href: "/admin/inventory",     minRole: "admin" },
  { key: "alarm-rules", label: "Alarm Rules",   href: "/admin/alarm-rules",   minRole: "admin" },
  { key: "boards",      label: "Boards",        href: "/admin/boards",        minRole: "admin" },
  { key: "settings",    label: "Settings",      href: "/admin/settings",      minRole: "admin" },
  { key: "users",       label: "Users",         href: "/admin/users",         minRole: "admin" },
  { key: "system",      label: "System",        href: "/admin/system",        minRole: "manufacturer" },
];

const ROLE_RANK: Record<UserRole, number> = {
  viewer: 0,
  technician: 1,
  admin: 2,
  manufacturer: 3,
};

const ROLE_META: Record<UserRole, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  viewer:       { label: "Viewer",       color: "text-slate-700",  bg: "bg-slate-100",  icon: Eye },
  technician:   { label: "Technician",   color: "text-blue-700",   bg: "bg-blue-50",    icon: Wrench },
  admin:        { label: "Admin",        color: "text-violet-700", bg: "bg-violet-50",  icon: ShieldCheck },
  manufacturer: { label: "Manufacturer", color: "text-amber-700",  bg: "bg-amber-50",   icon: FlaskConical },
};

const PASSWORD_ROLES = new Set<UserRole>(["admin", "manufacturer"]);

function readRoleCookie(): UserRole {
  if (typeof document === "undefined") return "viewer";
  const match = document.cookie.match(/(?:^|;\s*)ups_user=([^;]*)/);
  if (!match) return "viewer";
  try {
    const value = decodeURIComponent(match[1]);
    // Format is "base64payload.hmac" — only the payload part is needed client-side
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

// ── Role switcher modal ────────────────────────────────────────────────────────

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-950">Switch Role</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
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
                    ? `${m.bg} border-current ${m.color} shadow-sm`
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <Icon size={16} className={isActive ? m.color : "text-slate-400"} />
                <div>
                  <p className={`text-xs font-bold ${isActive ? m.color : "text-slate-700"}`}>{m.label}</p>
                  {isCurrent && <p className="text-[10px] text-slate-400">current</p>}
                </div>
              </button>
            );
          })}
        </div>

        {selected && (
          <>
            {PASSWORD_ROLES.has(selected) ? (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <KeyRound size={11} /> {ROLE_META[selected].label} Password
                </label>
                <input
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && switchRole()}
                  placeholder="Enter password…"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                />
                {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
                <button
                  onClick={switchRole}
                  disabled={loading || !password}
                  className={`rounded-lg py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                    ROLE_META[selected].bg.replace("bg-", "bg-").replace("-50", "-600 hover:bg-") + ROLE_META[selected].bg.replace("bg-", "").replace("-50", "-700")
                  } bg-slate-900 hover:bg-slate-800`}
                >
                  {loading ? "Authenticating…" : `Switch to ${ROLE_META[selected].label}`}
                </button>
              </div>
            ) : (
              <>
                {error && <p className="text-xs text-red-600 font-semibold mb-2">{error}</p>}
                <button
                  onClick={switchRole}
                  disabled={loading}
                  className="w-full rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
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
  const [apiStatus, setApiStatus] = useState<"ok" | "degraded" | "unknown">("unknown");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>(readRoleCookie);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [alarmsRes, healthRes] = await Promise.all([
          fetch("/api/alarms?state=active&limit=100", { cache: "no-store" }),
          fetch("/api/health", { cache: "no-store" }),
        ]);
        if (cancelled) return;
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

  const visibleLinks = NAV_LINKS.filter((l) => canAccess(userRole, l.minRole));
  const meta = ROLE_META[userRole];
  const RoleIcon = meta.icon;

  return (
    <div className="min-h-screen bg-[#eef3f8] text-slate-950">
      {showSwitcher && (
        <RoleSwitcher
          currentRole={userRole}
          onClose={() => { setShowSwitcher(false); setUserRole(readRoleCookie()); }}
        />
      )}

      {/* Sticky top navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex h-12 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">

          {/* Brand */}
          <Link href="/" className="flex shrink-0 items-center gap-2.5 mr-2">
            <Image
              src="/brand/automatrix-logo.png"
              alt="Automatrix"
              width={36}
              height={36}
              className="shrink-0 object-contain sm:w-9 sm:h-9 w-7 h-7"
              priority
            />
            <div className="flex flex-col leading-tight">
              <span className="font-bold text-sm text-slate-950 tracking-tight">UMS — UPS Monitoring</span>
              <span className="hidden text-xs text-slate-400 font-normal lg:block">Industrial UPS Monitoring System</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">
            {visibleLinks.map(({ key, label, href }) => (
              <Link
                key={key}
                href={href}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                  activeNav === key
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Right: status + role badge + sign out */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span
              className={`hidden sm:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                apiStatus === "ok"
                  ? "bg-emerald-50 text-emerald-700"
                  : apiStatus === "degraded"
                  ? "bg-red-50 text-red-700"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              <Activity size={11} />
              {apiStatus === "ok" ? "API Online" : apiStatus === "degraded" ? "API Error" : "—"}
            </span>

            <Link
              href="/alarms"
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold transition-colors ${
                alarmCount > 0
                  ? "bg-red-100 text-red-700 hover:bg-red-200"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              <Bell size={11} />
              {alarmCount > 0 ? `${alarmCount} alarm${alarmCount !== 1 ? "s" : ""}` : "No alarms"}
            </Link>

            {/* Role badge / switcher */}
            <button
              onClick={() => setShowSwitcher(true)}
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors hover:shadow-sm ${meta.bg} ${meta.color} border-current/20`}
              title="Switch role"
            >
              <RoleIcon size={11} />
              {meta.label}
              <ChevronDown size={10} className="opacity-60" />
            </button>

            <form action="/api/logout" method="post" className="hidden sm:block">
              <button
                className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                type="submit"
              >
                <LogOut size={11} />
                Exit
              </button>
            </form>

            {/* Mobile menu toggle */}
            <button
              className="flex md:hidden items-center rounded-md border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"
              onClick={() => setMobileOpen((v) => !v)}
              type="button"
              aria-label="Toggle menu"
            >
              <ChevronDown
                size={16}
                className={`transition-transform duration-150 ${mobileOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="border-t border-slate-100 bg-white px-4 pb-3 pt-2 md:hidden">
            <nav className="flex flex-col gap-1">
              {visibleLinks.map(({ key, label, href }) => (
                <Link
                  key={key}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold ${
                    activeNav === key ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </Link>
              ))}
              <button
                onClick={() => { setMobileOpen(false); setShowSwitcher(true); }}
                className={`mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${meta.bg} ${meta.color}`}
              >
                <RoleIcon size={14} /> {meta.label} — Switch Role
              </button>
              <form action="/api/logout" method="post" className="mt-1">
                <button className="w-full rounded-md border border-slate-200 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="submit">
                  Exit
                </button>
              </form>
            </nav>
          </div>
        )}
      </header>

      {/* Page content */}
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}
