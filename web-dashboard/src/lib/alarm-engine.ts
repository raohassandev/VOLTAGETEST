import type { PrismaClient } from "@prisma/client";

export type AlarmSeverity = "warning" | "critical";
export type AlarmState = "active" | "cleared";

export interface TelemetrySnapshot {
  deviceId: string;
  upsId?: string;
  upsUnitId?: string;
  siteId?: string;
  voltIn: number;
  voltOut: number;
  voltDc: number;
  ctIn: number;
  ctOut: number;
  sInVa: number;
  sOutVa: number;
  pInW?: number | null;
  pOutW?: number | null;
  pfIn?: number | null;
  pfOut?: number | null;
  freqIn?: number | null;
  freqOut?: number | null;
  qInVar?: number | null;
  qOutVar?: number | null;
  eInKwh?: number | null;
  eOutKwh?: number | null;
}

interface ThresholdCheck {
  metric: string;
  label: string;
  value: number;
  lowCritical?: number;
  lowWarning?: number;
  highWarning?: number;
  highCritical?: number;
  debounceSeconds: number;
  hysteresisPercent: number;
}

interface AlarmCandidate {
  metric: string;
  severity: AlarmSeverity;
  message: string;
}

const DEFAULT_DEBOUNCE_SECS = 30;
const DEFAULT_HYSTERESIS_PCT = 2;

const DEFAULT_THRESHOLDS: ThresholdCheck[] = [
  {
    metric: "volt_in",
    label: "Primary Voltage",
    value: 0,
    lowCritical: 180,
    lowWarning: 200,
    highWarning: 245,
    highCritical: 255,
    debounceSeconds: DEFAULT_DEBOUNCE_SECS,
    hysteresisPercent: DEFAULT_HYSTERESIS_PCT,
  },
  {
    metric: "volt_out",
    label: "Secondary Voltage",
    value: 0,
    lowCritical: 200,
    lowWarning: 210,
    highWarning: 245,
    highCritical: 255,
    debounceSeconds: DEFAULT_DEBOUNCE_SECS,
    hysteresisPercent: DEFAULT_HYSTERESIS_PCT,
  },
  {
    metric: "ct_in",
    label: "Primary Current",
    value: 0,
    highWarning: 28,
    highCritical: 32,
    debounceSeconds: DEFAULT_DEBOUNCE_SECS,
    hysteresisPercent: DEFAULT_HYSTERESIS_PCT,
  },
  {
    metric: "ct_out",
    label: "Secondary Current",
    value: 0,
    highWarning: 28,
    highCritical: 32,
    debounceSeconds: DEFAULT_DEBOUNCE_SECS,
    hysteresisPercent: DEFAULT_HYSTERESIS_PCT,
  },
];

async function resolveThresholds(
  prisma: PrismaClient,
  snap: TelemetrySnapshot,
  batteryNominalV: number,
  capacityVa: number,
): Promise<ThresholdCheck[]> {
  // Load all enabled rules that could apply to this device context.
  const dbRules = await prisma.alarmRule.findMany({
    where: {
      enabled: true,
      OR: [
        { deviceId: snap.deviceId },
        ...(snap.upsUnitId ? [{ upsUnitId: snap.upsUnitId, deviceId: null }] : []),
        ...(snap.siteId ? [{ siteId: snap.siteId, upsUnitId: null, deviceId: null }] : []),
        { deviceId: null, upsUnitId: null, siteId: null },
      ],
    },
  });

  // Compute priority: device=3, ups=2, site=1, global=0
  const priority = (r: (typeof dbRules)[0]) => {
    if (r.deviceId) return 3;
    if (r.upsUnitId) return 2;
    if (r.siteId) return 1;
    return 0;
  };

  // Build metric → best rule map
  const bestRule = new Map<string, (typeof dbRules)[0]>();
  for (const rule of dbRules) {
    const existing = bestRule.get(rule.metric);
    if (!existing || priority(rule) > priority(existing)) {
      bestRule.set(rule.metric, rule);
    }
  }

  // Merge DB overrides into hardcoded defaults
  const hardcoded = new Map<string, ThresholdCheck>(DEFAULT_THRESHOLDS.map((t) => [t.metric, t]));

  const resolved: ThresholdCheck[] = [];
  const allMetrics = new Set([...hardcoded.keys(), ...bestRule.keys()]);

  for (const metric of allMetrics) {
    const db = bestRule.get(metric);
    const hard = hardcoded.get(metric);
    if (db) {
      resolved.push({
        metric,
        label: db.label,
        value: 0,
        lowCritical: db.lowCritical ?? hard?.lowCritical,
        lowWarning: db.lowWarning ?? hard?.lowWarning,
        highWarning: db.highWarning ?? hard?.highWarning,
        highCritical: db.highCritical ?? hard?.highCritical,
        debounceSeconds: db.debounceSeconds,
        hysteresisPercent: db.hysteresisPercent,
      });
    } else if (hard) {
      resolved.push({ ...hard });
    }
  }

  // Battery threshold (volt_dc) - use DB override or compute from nominal
  const dcDb = bestRule.get("volt_dc");
  if (!resolved.find((r) => r.metric === "volt_dc")) {
    resolved.push(dcDb
      ? { metric: "volt_dc", label: dcDb.label, value: 0,
          lowCritical: dcDb.lowCritical ?? undefined,
          lowWarning: dcDb.lowWarning ?? undefined,
          highWarning: dcDb.highWarning ?? undefined,
          highCritical: dcDb.highCritical ?? undefined,
          debounceSeconds: dcDb.debounceSeconds,
          hysteresisPercent: dcDb.hysteresisPercent }
      : buildBatteryThresholds(batteryNominalV));
  }

  // Load percent
  if (capacityVa > 0) {
    const loadDb = bestRule.get("load_percent");
    if (!resolved.find((r) => r.metric === "load_percent")) {
      resolved.push(loadDb
        ? { metric: "load_percent", label: loadDb.label, value: 0,
            highWarning: loadDb.highWarning ?? 80,
            highCritical: loadDb.highCritical ?? 95,
            debounceSeconds: loadDb.debounceSeconds,
            hysteresisPercent: loadDb.hysteresisPercent }
        : { metric: "load_percent", label: "Output Load", value: 0,
            highWarning: 80, highCritical: 95,
            debounceSeconds: DEFAULT_DEBOUNCE_SECS,
            hysteresisPercent: DEFAULT_HYSTERESIS_PCT });
    }
  }

  return resolved;
}

function buildBatteryThresholds(nominalV: number): ThresholdCheck {
  return {
    metric: "volt_dc",
    label: "Battery Voltage",
    value: 0,
    lowCritical: nominalV * 0.875,
    lowWarning: nominalV * 0.917,
    highWarning: nominalV * 1.125,
    highCritical: nominalV * 1.188,
    debounceSeconds: DEFAULT_DEBOUNCE_SECS,
    hysteresisPercent: DEFAULT_HYSTERESIS_PCT,
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
  const resolved = await resolveThresholds(prisma, snap, batteryNominalV, capacityVa);

  const snapValues: Record<string, number | undefined> = {
    volt_in: snap.voltIn,
    volt_out: snap.voltOut,
    volt_dc: snap.voltDc,
    ct_in: snap.ctIn,
    ct_out: snap.ctOut,
    s_out_va: snap.sOutVa,
    load_percent: capacityVa > 0 ? (snap.sOutVa / capacityVa) * 100 : 0,
    overload_pct: capacityVa > 0 ? (snap.sOutVa / capacityVa) * 100 : 0,
    p_in_w: snap.pInW ?? undefined,
    p_out_w: snap.pOutW ?? undefined,
    pf_in: snap.pfIn ?? undefined,
    pf_out: snap.pfOut ?? undefined,
    freq_in: snap.freqIn ?? undefined,
    freq_out: snap.freqOut ?? undefined,
    q_in_var: snap.qInVar ?? undefined,
    q_out_var: snap.qOutVar ?? undefined,
    e_in_kwh: snap.eInKwh ?? undefined,
    e_out_kwh: snap.eOutKwh ?? undefined,
  };

  // Skip checks for metrics with no value in this snapshot (e.g. energy fields not yet firmware-supported)
  const checks: ThresholdCheck[] = resolved
    .filter((t) => snapValues[t.metric] !== undefined)
    .map((t) => ({ ...t, value: snapValues[t.metric] as number }));

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
    const check = checks.find((c) => c.metric === metric);
    const debounceMs = (check?.debounceSeconds ?? debounceSeconds) * 1000;

    let entry = debounceMap.get(key);
    if (!entry) {
      entry = { firstAt: now, severity: candidate.severity, message: candidate.message };
      debounceMap.set(key, entry);
    }

    if (now - entry.firstAt < debounceMs) continue;

    const updated = await prisma.alarm.updateMany({
      where: { deviceId: snap.deviceId, metric, state: "active" },
      data: {
        lastSeenAt: new Date(),
        severity: candidate.severity,
        message: candidate.message,
      },
    });

    if (updated.count === 0) {
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

  // Iterate unique metrics with active alarms and clear those no longer triggering.
  // Using distinct avoids iterating duplicate rows from a previous multi-worker burst.
  const activeAlarmMetrics = await prisma.alarm.findMany({
    where: { deviceId: snap.deviceId, state: "active" },
    select: { metric: true },
    distinct: ["metric"],
  });

  for (const { metric: activeMetric } of activeAlarmMetrics) {
    if (candidates.has(activeMetric)) continue;

    const check = checks.find((c) => c.metric === activeMetric);
    if (!check || isNormalWithHysteresis(check, check.hysteresisPercent ?? hysteresisPercent)) {
      await prisma.alarm.updateMany({
        where: { deviceId: snap.deviceId, metric: activeMetric, state: "active" },
        data: { state: "cleared", clearedAt: new Date() },
      });
      debounceMap.delete(`${snap.deviceId}:${activeMetric}`);
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
