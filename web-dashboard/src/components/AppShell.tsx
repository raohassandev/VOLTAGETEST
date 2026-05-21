"use client";

import { Activity, Bell, ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export type NavItem = "dashboard" | "alarms" | "inventory" | "alarm-rules" | "settings";

interface AppShellProps {
  children: React.ReactNode;
  activeNav?: NavItem;
}

const NAV_LINKS: { key: NavItem; label: string; href: string }[] = [
  { key: "dashboard",   label: "Dashboard",    href: "/" },
  { key: "alarms",      label: "Alarms",        href: "/alarms" },
  { key: "inventory",   label: "Inventory",     href: "/admin/inventory" },
  { key: "alarm-rules", label: "Alarm Rules",   href: "/admin/alarm-rules" },
  { key: "settings",    label: "Settings",      href: "/admin/settings" },
];

export default function AppShell({ children, activeNav }: AppShellProps) {
  const [alarmCount, setAlarmCount] = useState(0);
  const [apiStatus, setApiStatus] = useState<"ok" | "degraded" | "unknown">("unknown");
  const [mobileOpen, setMobileOpen] = useState(false);

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
        if (!cancelled) {
          setApiStatus(healthRes.ok ? "ok" : "degraded");
        }
      } catch {
        if (!cancelled) setApiStatus("degraded");
      }
    }

    poll();
    const t = window.setInterval(poll, 15_000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, []);

  return (
    <div className="min-h-screen bg-[#eef3f8] text-slate-950">
      {/* Sticky top navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex h-12 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">

          {/* Brand */}
          <Link href="/" className="flex shrink-0 items-center gap-2 mr-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-950 text-white">
              <ShieldCheck size={14} />
            </span>
            <span className="font-bold text-sm text-slate-950 tracking-tight">UMS</span>
            <span className="hidden text-slate-300 lg:inline text-sm">—</span>
            <span className="hidden text-sm text-slate-500 font-medium lg:inline">UPS Monitoring</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 min-w-0">
            {NAV_LINKS.map(({ key, label, href }) => (
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
            <span className="rounded-md px-3 py-1.5 text-sm text-slate-400 select-none cursor-default">
              Boards <span className="text-xs">(coming soon)</span>
            </span>
          </nav>

          {/* Right badges + sign out */}
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
              {apiStatus === "ok" ? "Online" : apiStatus === "degraded" ? "Error" : "—"}
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

            <form action="/api/logout" method="post" className="hidden sm:block">
              <button
                className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                type="submit"
              >
                <LogOut size={11} />
                Sign out
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
              {NAV_LINKS.map(({ key, label, href }) => (
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
              <span className="px-3 py-2 text-sm text-slate-400">Boards (coming soon)</span>
              <form action="/api/logout" method="post" className="mt-2">
                <button
                  className="w-full rounded-md border border-slate-200 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  type="submit"
                >
                  Sign out
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
