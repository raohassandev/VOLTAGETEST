"use client";

import { FlaskConical, History, Settings2, ToggleLeft, ToggleRight } from "lucide-react";
import Link from "next/link";
import AppShell from "@/components/AppShell";

const SECTIONS = [
  {
    href: "/admin/calibration",
    icon: FlaskConical,
    label: "Sensor Calibration",
    description: "Adjust scale and offset coefficients for voltage and current channels on each device.",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  {
    href: "/admin/system/history",
    icon: History,
    label: "History Control",
    description: "Configure telemetry retention periods, rollup intervals, and purge schedules.",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    soon: true,
  },
  {
    href: "/admin/system/features",
    icon: ToggleRight,
    label: "Feature Flags",
    description: "Enable or disable system features: MQTT worker, alarm engine, rollup jobs.",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    soon: true,
  },
  {
    href: "/admin/system/params",
    icon: Settings2,
    label: "System Parameters",
    description: "Low-level parameters: offline threshold, debounce defaults, hysteresis globals.",
    color: "text-slate-700",
    bg: "bg-slate-100",
    border: "border-slate-300",
    soon: true,
  },
];

export default function SystemPage() {
  return (
    <AppShell activeNav="system">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-950">System — Manufacturer Access</h1>
        <p className="text-sm text-slate-500 mt-1">
          Advanced controls for device calibration, data history, feature flags, and system-level parameters.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const inner = (
            <div
              className={`relative rounded-xl border ${s.border} ${s.bg} p-5 h-full flex flex-col gap-3 transition-shadow hover:shadow-md`}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-white border ${s.border}`}>
                <Icon size={20} className={s.color} />
              </div>
              <div>
                <p className={`font-bold text-sm ${s.color}`}>
                  {s.label}
                  {s.soon && (
                    <span className="ml-2 rounded-full bg-white border border-slate-200 px-1.5 py-0.5 text-xs font-semibold text-slate-400">
                      coming soon
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{s.description}</p>
              </div>
            </div>
          );

          return s.soon ? (
            <div key={s.href} className="opacity-70 cursor-default select-none">
              {inner}
            </div>
          ) : (
            <Link key={s.href} href={s.href} className="block h-full">
              {inner}
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
