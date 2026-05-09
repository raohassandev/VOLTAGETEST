"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, Save, Settings, TableProperties } from "lucide-react";
import {
  Alarm,
  ModuleConfig,
  ParameterConfig,
  TelemetryKey,
  TelemetryRow,
  expectedPublishIntervalMs,
  formatNumber,
  telemetryKeys,
  useTelemetry,
} from "@/lib/telemetry";

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "bad" | "warn";
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    good: "bg-emerald-100 text-emerald-700",
    bad: "bg-red-100 text-red-700",
    warn: "bg-amber-100 text-amber-800",
  };

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

function ConfigTable({
  config,
  setConfig,
}: {
  config: ModuleConfig;
  setConfig: React.Dispatch<React.SetStateAction<ModuleConfig>>;
}) {
  function updateParameter(
    key: TelemetryKey,
    field: keyof ParameterConfig,
    value: string | boolean,
  ) {
    setConfig((current) => ({
      ...current,
      parameters: {
        ...current.parameters,
        [key]: {
          ...current.parameters[key],
          [field]:
            field === "enabled" || field === "label" || field === "unit"
              ? value
              : Number(value),
        },
      },
    }));
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Calibration and thresholds</h2>
          <p className="text-sm text-slate-500">Calibrated value = raw value * scale + offset.</p>
        </div>
        <Pill tone="good">
          <Save size={13} className="mr-1 inline" />
          Auto saved
        </Pill>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-3">Enabled</th>
              <th className="py-2 pr-3">Parameter</th>
              <th className="py-2 pr-3">Unit</th>
              <th className="py-2 pr-3">Scale</th>
              <th className="py-2 pr-3">Offset</th>
              <th className="py-2 pr-3">Low</th>
              <th className="py-2 pr-3">High</th>
            </tr>
          </thead>
          <tbody>
            {telemetryKeys.map((key) => {
              const parameter = config.parameters[key];
              return (
                <tr key={key} className="border-b border-slate-100">
                  <td className="py-3 pr-3">
                    <input
                      type="checkbox"
                      checked={parameter.enabled}
                      onChange={(event) => updateParameter(key, "enabled", event.target.checked)}
                    />
                  </td>
                  <td className="py-3 pr-3">
                    <input
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5"
                      value={parameter.label}
                      onChange={(event) => updateParameter(key, "label", event.target.value)}
                    />
                  </td>
                  <td className="py-3 pr-3">
                    <input
                      className="w-20 rounded-md border border-slate-300 px-2 py-1.5"
                      value={parameter.unit}
                      onChange={(event) => updateParameter(key, "unit", event.target.value)}
                    />
                  </td>
                  {(["scale", "offset", "low", "high"] as const).map((field) => (
                    <td key={field} className="py-3 pr-3">
                      <input
                        className="w-28 rounded-md border border-slate-300 px-2 py-1.5"
                        type="number"
                        step="0.0001"
                        value={parameter[field]}
                        onChange={(event) => updateParameter(key, field, event.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AlarmsTable({ alarms }: { alarms: Alarm[] }) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Alarms</h2>
        <Pill tone={alarms.length ? "bad" : "good"}>{alarms.length} active</Pill>
      </div>
      {alarms.length === 0 ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
          No active alarms.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-3">Time</th>
                <th className="py-2 pr-3">Parameter</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Value</th>
                <th className="py-2 pr-3">Limit</th>
              </tr>
            </thead>
            <tbody>
              {alarms.map((alarm) => (
                <tr key={alarm.key} className="border-b border-slate-100">
                  <td className="py-3 pr-3">{alarm.time}</td>
                  <td className="py-3 pr-3 font-medium">{alarm.label}</td>
                  <td className="py-3 pr-3"><Pill tone="bad">{alarm.type}</Pill></td>
                  <td className="py-3 pr-3">{formatNumber(alarm.value)} {alarm.unit}</td>
                  <td className="py-3 pr-3">{formatNumber(alarm.limit)} {alarm.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ValuesTable({ rows }: { rows: TelemetryRow[] }) {
  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <TableProperties size={20} />
        <h2 className="text-lg font-semibold">Raw, calibrated, and threshold values</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-3">Parameter</th>
              <th className="py-2 pr-3">Raw</th>
              <th className="py-2 pr-3">Calibrated</th>
              <th className="py-2 pr-3">Low</th>
              <th className="py-2 pr-3">High</th>
              <th className="py-2 pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-slate-100">
                <td className="py-3 pr-3 font-medium">{row.parameter.label}</td>
                <td className="py-3 pr-3">{formatNumber(row.raw)}</td>
                <td className="py-3 pr-3">{formatNumber(row.value)} {row.parameter.unit}</td>
                <td className="py-3 pr-3">{formatNumber(row.parameter.low)} {row.parameter.unit}</td>
                <td className="py-3 pr-3">{formatNumber(row.parameter.high)} {row.parameter.unit}</td>
                <td className="py-3 pr-3">
                  <Pill tone={row.status === "normal" ? "good" : row.status === "disabled" ? "neutral" : "bad"}>
                    {row.status}
                  </Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function EngineeringConsole() {
  const {
    alarms,
    config,
    history,
    lastMessageAt,
    lastPayload,
    messageIntervalMs,
    mqttStatus,
    parseError,
    rows,
    setConfig,
    telemetry,
  } = useTelemetry();

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <Link className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-600" href="/">
              <ArrowLeft size={16} /> End-user dashboard
            </Link>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Engineering console</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">UPS Monitoring System</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">ABC / AMX diagnostics and configuration</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Pill tone={mqttStatus === "connected" ? "good" : mqttStatus === "connecting" ? "warn" : "bad"}>
              MQTT {mqttStatus}
            </Pill>
            <Pill>{telemetry.ip || "No module IP"}</Pill>
            <Pill>Last update {lastMessageAt || "--"}</Pill>
          </div>
        </header>

        {parseError ? (
          <Card className="border-red-200 bg-red-50 text-sm font-medium text-red-700">{parseError}</Card>
        ) : null}

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Settings size={20} />
            <h2 className="text-lg font-semibold">Realtime MQTT diagnostics</h2>
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-slate-500">Subscribe topic</p>
              <p className="mt-1 break-all font-semibold">{config.topic}</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-slate-500">WebSocket broker</p>
              <p className="mt-1 break-all font-semibold">{config.brokerUrl}</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-slate-500">Expected publish interval</p>
              <p className="mt-1 font-semibold">{expectedPublishIntervalMs} ms</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-slate-500">Measured message interval</p>
              <p className="mt-1 font-semibold">
                {messageIntervalMs ? `${messageIntervalMs} ms` : "--"}
              </p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-slate-500">Module IP from payload</p>
              <p className="mt-1 font-semibold">{telemetry.ip || "--"}</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-slate-500">History samples in browser</p>
              <p className="mt-1 font-semibold">{history.length}</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-slate-500">Last message</p>
              <p className="mt-1 font-semibold">{lastMessageAt || "--"}</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-slate-500">Connection status</p>
              <p className="mt-1 font-semibold">{mqttStatus}</p>
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-slate-600">Latest MQTT topic message</p>
            <pre className="max-h-56 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">
              {lastPayload
                ? JSON.stringify(JSON.parse(lastPayload), null, 2)
                : "Waiting for MQTT payload..."}
            </pre>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Settings size={20} />
            <h2 className="text-lg font-semibold">MQTT and module settings</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium">
              Module name
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                value={config.moduleName}
                onChange={(event) => setConfig((current) => ({ ...current, moduleName: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium md:col-span-2">
              MQTT WebSocket broker
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                value={config.brokerUrl}
                onChange={(event) => setConfig((current) => ({ ...current, brokerUrl: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-sm font-medium md:col-span-3">
              MQTT topic
              <input
                className="rounded-md border border-slate-300 px-3 py-2"
                value={config.topic}
                onChange={(event) => setConfig((current) => ({ ...current, topic: event.target.value }))}
              />
            </label>
          </div>
        </Card>

        <ConfigTable config={config} setConfig={setConfig} />
        <AlarmsTable alarms={alarms} />
        <ValuesTable rows={rows} />

        <Card>
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={20} />
            <h2 className="text-lg font-semibold">Developer notes</h2>
          </div>
          <div className="grid gap-2 text-sm text-slate-600">
            <p>ESP32 publishes on TCP MQTT port 1883. Browser dashboard subscribes through broker WebSocket URL.</p>
            <p>Calibration and thresholds are stored in browser localStorage for the demo phase.</p>
            <p>For VPS production, move configuration, alarm history, and telemetry history into a database.</p>
          </div>
        </Card>
      </div>
    </main>
  );
}
