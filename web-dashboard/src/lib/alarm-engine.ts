import type { PrismaClient } from "@prisma/client";

export type AlarmSeverity = "warning" | "critical";
export type AlarmState = "active" | "cleared";

export interface TelemetrySnapshot {
  deviceId: string;
  upsId?: string;
  siteId?: string;
  voltIn: number;
  voltOut: number;
  voltDc: number;
  ctIn: number;
  ctOut: number;
  sInVa: number;
  sOutVa: number;
}

interface ThresholdCheck {
  metric: string;
  label: string;
  value: number;
  lowCritical?: number;
  lowWarning?: number;
  highWarning?: number;
  highCritical?: number;
}

interface AlarmCandidate {
  metric: string;
  severity: AlarmSeverity;
  message: string;
}

const DEFAULT_THRESHOLDS: ThresholdCheck[] = [
  {
    metric: "volt_in",
    label: "Input Voltage",
    value: 0,
    lowCritical: 180,
    lowWarning: 200,
    highWarning: 245,
    highCritical: 255,
  },
  {
    metric: "volt_out",
    label: "Output Voltage",
    value: 0,
    lowCritical: 200,
    lowWarning: 210,
    highWarning: 245,
    highCritical: 255,
  },
  {
    metric: "ct_in",
    label: "Input Current",
    value: 0,
    highWarning: 28,
    highCritical: 32,
  },
  {
    metric: "ct_out",
    label: "Output Current",
    value: 0,
    highWarning: 28,
    highCritical: 32,
  },
];

function buildBatteryThresholds(nominalV: number): ThresholdCheck {
  return {
    metric: "volt_dc",
    label: "Battery Voltage",
    value: 0,
    lowCritical: nominalV * 0.875,
    lowWarning: nominalV * 0.917,
    highWarning: nominalV * 1.125,
    highCritical: nominalV * 1.188,
  };
}

function evaluateThreshold(check: ThresholdCheck): AlarmCandidate | null {
  const { metric, label, value } = check;

  if (check.lowCritical !== undefined && value < check.lowCritical) {
    return { metric, severity: "critical", message: `${label} critically low: ${value.toFixed(1)} (limit ${check.lowCritical})` };
  }
  if (check.lowWarning !== undefined && value < check.lowWarning) {
    return { metric, severity: "warning", message: `${label} low: ${value.toFixed(1)} (limit ${check.lowWarning})` };
  }
  if (check.highCritical !== undefined && value > check.highCritical) {
    return { metric, severity: "critical", message: `${label} critically high: ${value.toFixed(1)} (limit ${check.highCritical})` };
  }
  if (check.highWarning !== undefined && value > check.highWarning) {
    return { metric, severity: "warning", message: `${label} high: ${value.toFixed(1)} (limit ${check.highWarning})` };
  }

  return null;
}

function isNormalWithHysteresis(check: ThresholdCheck, hysteresisPercent: number): boolean {
  const h = 1 + hysteresisPercent / 100;
  const { value } = check;

  if (check.lowCritical !== undefined && value < check.lowCritical * h) return false;
  if (check.lowWarning !== undefined && value < check.lowWarning * h) return false;
  if (check.highCritical !== undefined && value > check.highCritical / h) return false;
  if (check.highWarning !== undefined && value > check.highWarning / h) return false;

  return true;
}

interface DebounceEntry {
  firstAt: number;
  severity: AlarmSeverity;
  message: string;
}

const debounceMap = new Map<string, DebounceEntry>();

export async function evaluateAlarms(
  prisma: PrismaClient,
  snap: TelemetrySnapshot,
  batteryNominalV = 48,
  capacityVa = 0,
  debounceSeconds = 30,
  hysteresisPercent = 2,
): Promise<void> {
  const snapValues: Record<string, number> = {
    volt_in: snap.voltIn,
    volt_out: snap.voltOut,
    ct_in: snap.ctIn,
    ct_out: snap.ctOut,
  };
  const checks: ThresholdCheck[] = [
    ...DEFAULT_THRESHOLDS.map((t) => ({ ...t, value: snapValues[t.metric] ?? 0 })),
    { ...buildBatteryThresholds(batteryNominalV), value: snap.voltDc },
  ];

  if (capacityVa > 0) {
    const loadPct = (snap.sOutVa / capacityVa) * 100;
    checks.push({
      metric: "overload_pct",
      label: "Output Load",
      value: loadPct,
      highWarning: 80,
      highCritical: 95,
    });
  }

  const now = Date.now();
  const candidates = new Map<string, AlarmCandidate>();

  for (const check of checks) {
    const candidate = evaluateThreshold(check);
    if (candidate) {
      candidates.set(candidate.metric, candidate);
    }
  }

  for (const [metric, candidate] of candidates) {
    const key = `${snap.deviceId}:${metric}`;
    const debounceMs = debounceSeconds * 1000;

    let entry = debounceMap.get(key);
    if (!entry) {
      entry = { firstAt: now, severity: candidate.severity, message: candidate.message };
      debounceMap.set(key, entry);
    }

    if (now - entry.firstAt < debounceMs) continue;

    const existing = await prisma.alarm.findFirst({
      where: { deviceId: snap.deviceId, metric, state: "active" },
    });

    if (existing) {
      await prisma.alarm.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          severity: candidate.severity,
          message: candidate.message,
        },
      });
    } else {
      await prisma.alarm.create({
        data: {
          deviceId: snap.deviceId,
          upsId: snap.upsId,
          siteId: snap.siteId,
          metric,
          severity: candidate.severity,
          state: "active",
          message: candidate.message,
        },
      });
    }
  }

  const activeAlarms = await prisma.alarm.findMany({
    where: { deviceId: snap.deviceId, state: "active" },
  });

  for (const alarm of activeAlarms) {
    if (candidates.has(alarm.metric)) continue;

    const check = checks.find((c) => c.metric === alarm.metric);
    if (!check) {
      await prisma.alarm.update({
        where: { id: alarm.id },
        data: { state: "cleared", clearedAt: new Date() },
      });
      debounceMap.delete(`${snap.deviceId}:${alarm.metric}`);
      continue;
    }

    if (isNormalWithHysteresis(check, hysteresisPercent)) {
      await prisma.alarm.update({
        where: { id: alarm.id },
        data: { state: "cleared", clearedAt: new Date() },
      });
      debounceMap.delete(`${snap.deviceId}:${alarm.metric}`);
    }
  }
}

export async function markDeviceOffline(
  prisma: PrismaClient,
  deviceId: string,
  upsId?: string,
  siteId?: string,
): Promise<void> {
  const existing = await prisma.alarm.findFirst({
    where: { deviceId, metric: "offline", state: "active" },
  });

  if (!existing) {
    await prisma.alarm.create({
      data: {
        deviceId,
        upsId,
        siteId,
        metric: "offline",
        severity: "critical",
        state: "active",
        message: `Device ${deviceId} is offline (no telemetry received)`,
      },
    });
  }
}

export async function markDeviceOnline(
  prisma: PrismaClient,
  deviceId: string,
): Promise<void> {
  await prisma.alarm.updateMany({
    where: { deviceId, metric: "offline", state: "active" },
    data: { state: "cleared", clearedAt: new Date() },
  });
  debounceMap.delete(`${deviceId}:offline`);
}
