"use client";

import { AlertTriangle, CheckCircle2, Clipboard, KeyRound, Upload, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { checkUnauthorized, guardManufacturer } from "@/lib/handle-unauthorized";
import type { LicenseStatus } from "@/lib/license/types";

export default function LicensePage() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [machineCode, setMachineCode] = useState("");
  const [licenseText, setLicenseText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [machineRes, statusRes] = await Promise.all([
      fetch("/api/license/machine-code"),
      fetch("/api/license/status"),
    ]);
    if (checkUnauthorized(machineRes) || checkUnauthorized(statusRes)) return;
    if (machineRes.ok) setMachineCode((await machineRes.json()).machineCode);
    if (statusRes.ok) setStatus(await statusRes.json());
  }

  useEffect(() => {
    guardManufacturer();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((error) => setMessage(String(error)));
  }, []);

  async function activate() {
    setBusy(true);
    setMessage("");
    try {
      const parsed = JSON.parse(licenseText);
      const res = await fetch("/api/license/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license: parsed }),
      });
      if (checkUnauthorized(res)) return;
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "License activation failed.");
      setLicenseText("");
      setMessage("License activated.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invalid license.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/license/remove", { method: "POST" });
      if (checkUnauthorized(res)) return;
      if (!res.ok) throw new Error("Could not remove license.");
      setMessage("License removed.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove license.");
    } finally {
      setBusy(false);
    }
  }

  const good = status?.state === "active" || status?.state === "disabled";
  const StateIcon = good ? CheckCircle2 : status?.state === "grace" ? AlertTriangle : XCircle;

  return (
    <AppShell activeNav="license">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">License</h1>
            <p className="text-sm text-slate-400">Offline signed activation for this UMS installation.</p>
          </div>
          <div className="flex items-center gap-2 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300">
            <KeyRound size={16} className="text-cyan-300" />
            <span className="font-mono">{machineCode || "Loading..."}</span>
            <button
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              title="Copy machine code"
              onClick={() => navigator.clipboard?.writeText(machineCode)}
            >
              <Clipboard size={15} />
            </button>
          </div>
        </div>

        <section className="rounded border border-slate-800 bg-slate-950/60 p-5">
          <div className="flex items-start gap-3">
            <StateIcon size={22} className={good ? "text-emerald-300" : "text-amber-300"} />
            <div>
              <div className="text-lg font-semibold text-slate-100">{status?.state ?? "loading"}</div>
              <div className="mt-1 text-sm text-slate-400">{status?.message ?? "Checking license..."}</div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Active UPS" value={String(status?.usedUps ?? "-")} />
            <Metric label="Licensed Seats" value={String(status?.maxUps ?? "-")} />
            <Metric label="Remaining" value={String(status?.remainingUps ?? "-")} />
            <Metric label="Expires" value={status?.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : "Perpetual"} />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-300" htmlFor="license-json">Activation file JSON</label>
            <textarea
              id="license-json"
              className="min-h-56 w-full rounded border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-slate-200 outline-none focus:border-cyan-500"
              value={licenseText}
              onChange={(event) => setLicenseText(event.target.value)}
              placeholder='{"algorithm":"Ed25519","payload":"...","signature":"..."}'
            />
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex items-center gap-2 rounded bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
                disabled={busy || !licenseText.trim()}
                onClick={activate}
              >
                <Upload size={16} /> Activate
              </button>
              <button
                className="rounded border border-red-800 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-950 disabled:opacity-50"
                disabled={busy}
                onClick={remove}
              >
                Remove License
              </button>
            </div>
            {message && <p className="text-sm text-amber-300">{message}</p>}
          </div>

          <div className="rounded border border-slate-800 bg-slate-950/60 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">License Details</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Detail label="Customer" value={status?.license?.customerName} />
              <Detail label="Reseller" value={status?.license?.resellerName} />
              <Detail label="Site" value={status?.license?.siteName} />
              <Detail label="Plan" value={status?.license?.plan} />
              <Detail label="Grace Ends" value={status?.graceEndsAt ? new Date(status.graceEndsAt).toLocaleDateString() : undefined} />
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              {Object.entries(status?.features ?? {}).map(([feature, enabled]) => (
                <span
                  key={feature}
                  className={`rounded border px-2 py-1 text-xs ${enabled ? "border-emerald-700 text-emerald-300" : "border-slate-700 text-slate-500"}`}
                >
                  {feature}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-200">{value || "-"}</dd>
    </div>
  );
}
