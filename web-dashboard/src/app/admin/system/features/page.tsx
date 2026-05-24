"use client";

import { ArrowLeft, CheckCircle2, Info, ToggleRight, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { checkUnauthorized } from "@/lib/handle-unauthorized";

interface HealthData {
  status: string;
  dbEnabled: boolean;
  db: string;
  mqttBrokerUrl: string | null;
  mqttBrokerReachable: boolean | "embedded";
  lastTelemetryAt: string | null;
  lastTelemetryAgeSecs: number | null;
  lastTelemetryDevice: string | null;
  uptime: number;
}

function FeatureRow({
  label,
  description,
  enabled,
  tag,
}: {
  label: string;
  description: string;
  enabled: boolean;
  tag?: string;
}) {
  return (
    <div className="flex items-start justify-between py-4 border-b border-slate-800 last:border-0 gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-200">{label}</p>
          {tag && (
            <span className="rounded-full bg-slate-800 border border-slate-700 px-1.5 py-0.5 text-xs text-slate-500">
              {tag}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {enabled ? (
          <>
            <CheckCircle2 size={15} className="text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-400">Active</span>
          </>
        ) : (
          <>
            <XCircle size={15} className="text-red-500" />
            <span className="text-xs font-semibold text-red-400">Inactive</span>
          </>
        )}
      </div>
    </div>
  );
}

function fmtUptime(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function FeaturesPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/system/health", { credentials: "include" })
      .then((r) => {
        checkUnauthorized(r);
        return r.json();
      })
      .then((d) => setHealth(d as HealthData))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const embeddedBroker = health?.mqttBrokerReachable === "embedded";
  const externalBrokerOk = health?.mqttBrokerReachable === true;
  const brokerActive = embeddedBroker || externalBrokerOk;

  return (
    <AppShell activeNav="system">
      <div className="iot-page max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/admin/system" className="text-slate-400 hover:text-slate-200 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-2">
            <ToggleRight size={18} className="text-emerald-400" />
            <h1 className="text-xl font-bold text-white">Feature Flags</h1>
          </div>
        </div>

        <div className="mb-4 flex items-start gap-2 rounded-lg border border-slate-700 bg-slate-800/40 px-4 py-3">
          <Info size={14} className="text-slate-500 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-500 leading-relaxed">
            Feature status is determined by environment variables set at server startup. To change a feature, update the relevant variable in <code className="text-slate-400">.env</code> (or Docker Compose) and restart the service.
          </p>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : health ? (
          <>
            {/* Server status */}
            <div className="iot-card rounded-xl border border-slate-700 p-5 mb-4">
              <h2 className="text-sm font-bold text-slate-300 mb-1">Server</h2>
              <div className="flex gap-6 mt-2">
                <div>
                  <p className="text-xs text-slate-500">Uptime</p>
                  <p className="text-sm font-mono text-slate-200">{fmtUptime(health.uptime)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Overall status</p>
                  <p className={`text-sm font-semibold ${health.status === "ok" ? "text-emerald-400" : "text-amber-400"}`}>
                    {health.status}
                  </p>
                </div>
                {health.lastTelemetryDevice && (
                  <div>
                    <p className="text-xs text-slate-500">Last telemetry</p>
                    <p className="text-sm text-slate-200">
                      {health.lastTelemetryAgeSecs != null
                        ? `${health.lastTelemetryAgeSecs}s ago`
                        : "—"}{" "}
                      <span className="text-xs text-slate-500">({health.lastTelemetryDevice})</span>
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Features */}
            <div className="iot-card rounded-xl border border-slate-700 p-5">
              <h2 className="text-sm font-bold text-slate-300 mb-1">Features</h2>

              <FeatureRow
                label="PostgreSQL Database"
                description="Telemetry persistence, alarm engine, rollup aggregation, and user management. Required for all production features."
                enabled={health.dbEnabled && health.db === "connected"}
              />
              <FeatureRow
                label="MQTT Broker"
                description={
                  embeddedBroker
                    ? "Embedded Aedes broker (ENABLE_EMBEDDED_BROKER=true). Suitable for development only."
                    : `External broker: ${health.mqttBrokerUrl ?? "not configured"}`
                }
                enabled={brokerActive}
                tag={embeddedBroker ? "embedded" : "external"}
              />
              <FeatureRow
                label="MQTT Worker"
                description="Background process that subscribes to device telemetry, persists to DB, runs alarm evaluation, and manages rollups. Start with: npm run worker:start"
                enabled={health.lastTelemetryAgeSecs != null && health.lastTelemetryAgeSecs < 300}
                tag="separate process"
              />
              <FeatureRow
                label="Alarm Engine"
                description="Evaluates per-device alarm rules on every telemetry message. Runs inside the MQTT worker process."
                enabled={health.dbEnabled && health.db === "connected"}
              />
              <FeatureRow
                label="Telemetry Rollup"
                description="Aggregates raw telemetry into 1-minute buckets for efficient historical charting. Runs every 60s in the worker."
                enabled={health.dbEnabled && health.db === "connected"}
              />
              <FeatureRow
                label="LAN Device Scanner"
                description="Scans the local ARP table to discover ESP32 boards and probe /api/info. Works on Linux/Windows hosts."
                enabled={true}
                tag="ARP-based"
              />
              <FeatureRow
                label="Config Push (MQTT)"
                description="Push calibration/reporting config to devices over MQTT. Requires embedded broker mode and firmware with config subscriptions."
                enabled={embeddedBroker}
                tag="embedded broker only"
              />
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
