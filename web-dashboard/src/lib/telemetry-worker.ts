/**
 * Telemetry worker — runs in-process inside instrumentation.ts.
 * Subscribes to the embedded Aedes broker, ingests telemetry, persists to
 * PostgreSQL, and drives the alarm engine.
 *
 * Supports both payload formats:
 *   v2 (new firmware):  v_in, i_in, p_in_w, q_in_var, f_in_hz, v_batt, …
 *   v1 (legacy):        volt_in, volt_out, volt_dc, ct_in, ct_out, s_out_va, …
 */

import mqtt from "mqtt";
import { PrismaClient } from "@prisma/client";
import { evaluateAlarms, markDeviceOffline, markDeviceOnline } from "./alarm-engine";
import { getEventBus } from "./event-bus";

// TODO: import rollup from worker/rollup once it is moved into src/lib
// For now we dynamically require it to avoid breaking the build while the file lives in worker/

const OFFLINE_THRESHOLD_MS = Number(process.env.OFFLINE_THRESHOLD_SECS ?? "60") * 1_000;
const OFFLINE_CHECK_MS     = 30_000;
const ROLLUP_MS            = 60_000;
const CLEANUP_MS           = 24 * 60 * 60 * 1_000;

// When no CalibrationProfile exists, apply this scale to convert raw ADC counts → volts.
const VOLT_DC_DEFAULT_SCALE = 0.0442;

// ── Payload types ─────────────────────────────────────────────────────────────

/** v2 payload — new ESP32 firmware */
interface PayloadV2 {
  device_id?: string;
  ts?: number;
  seq?: number;
  // Input
  v_in?: number;   i_in?: number;   p_in_w?: number;
  pf_in?: number;  q_in_var?: number; e_in_kwh?: number; f_in_hz?: number;
  // Output
  v_out?: number;  i_out?: number;  p_out_w?: number;
  pf_out?: number; q_out_var?: number; e_out_kwh?: number; f_out_hz?: number;
  // Battery
  v_batt?: number;
  // Device
  rssi?: number; ip?: string; fw?: string; mac?: string;
}

/** v1 payload — legacy firmware, still supported */
interface PayloadV1 {
  device_id?: string; ups_id?: string; site_id?: string;
  volt_in?: number;  volt_out?: number; volt_dc?: number;
  ct_in?: number;    ct_out?: number;
  s_in_va?: number;  s_out_va?: number;
  p_in_w?: number;   p_out_w?: number;
  pf_in?: number;    pf_out?: number;
  e_in_kwh?: number; e_out_kwh?: number;
  rssi?: number; ip?: string; firmware?: string; mac?: string; seq?: number;
}

type RawPayload = PayloadV1 & PayloadV2;

// ── Helpers ───────────────────────────────────────────────────────────────────

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function optNum(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Normalise both v1 and v2 payloads into a single unified shape */
function normalise(p: RawPayload) {
  return {
    deviceId:  str(p.device_id ?? p.ups_id) ?? null,
    upsId:     str(p.ups_id),
    siteId:    str(p.site_id),
    seq:       optNum(p.seq),
    // Voltages — v2 wins, fall back to v1
    voltIn:    num(p.v_in  ?? p.volt_in),
    voltOut:   num(p.v_out ?? p.volt_out),
    voltDc:    num(p.v_batt ?? p.volt_dc),
    // Currents
    ctIn:      num(p.i_in  ?? p.ct_in),
    ctOut:     num(p.i_out ?? p.ct_out),
    // Apparent power
    sInVa:     num(p.s_in_va  ?? (p.v_in  && p.i_in  ? p.v_in  * p.i_in  : 0)),
    sOutVa:    num(p.s_out_va ?? (p.v_out && p.i_out ? p.v_out * p.i_out : 0)),
    // Active power
    pInW:      optNum(p.p_in_w  ?? p.p_in_w),
    pOutW:     optNum(p.p_out_w ?? p.p_out_w),
    // Power factor
    pfIn:      optNum(p.pf_in),
    pfOut:     optNum(p.pf_out),
    // Reactive power (v2 only)
    qInVar:    optNum(p.q_in_var),
    qOutVar:   optNum(p.q_out_var),
    // Energy
    eInKwh:    optNum(p.e_in_kwh),
    eOutKwh:   optNum(p.e_out_kwh),
    // Frequency (v2 only)
    freqIn:    optNum(p.f_in_hz),
    freqOut:   optNum(p.f_out_hz),
    // Device
    rssi:      p.rssi !== undefined ? Math.round(num(p.rssi)) : null,
    ip:        str(p.ip),
    firmware:  str(p.fw ?? p.firmware),
    mac:       str(p.mac),
  };
}

// ── Database operations ───────────────────────────────────────────────────────

async function upsertDevice(prisma: PrismaClient, fields: ReturnType<typeof normalise>): Promise<void> {
  const { deviceId, ip, mac, firmware } = fields;
  if (!deviceId) return;

  await prisma.device.upsert({
    where:  { deviceId },
    create: { deviceId, ip, mac, firmware, lastSeenAt: new Date(), online: true },
    update: { ip, mac, firmware, lastSeenAt: new Date(), online: true },
  });

  // Auto-link to UpsUnit if device_id matches a known upsId
  if (fields.upsId) {
    const unit = await prisma.upsUnit.findUnique({ where: { upsId: fields.upsId } });
    if (unit) {
      await prisma.device.update({
        where: { deviceId },
        data:  { upsUnitId: unit.id, siteId: unit.siteId },
      });
    }
  }
}

async function persistTelemetry(
  prisma: PrismaClient,
  fields: ReturnType<typeof normalise>,
  rawJson: object,
): Promise<void> {
  const { deviceId } = fields;
  if (!deviceId) return;

  const data = {
    deviceId,
    upsId:      fields.upsId    ?? null,
    siteId:     fields.siteId   ?? null,
    receivedAt: new Date(),
    seq:        fields.seq      ?? undefined,
    voltIn:     fields.voltIn,
    voltOut:    fields.voltOut,
    voltDc:     fields.voltDc,
    ctIn:       fields.ctIn,
    ctOut:      fields.ctOut,
    sInVa:      fields.sInVa,
    sOutVa:     fields.sOutVa,
    pInW:       fields.pInW,
    pOutW:      fields.pOutW,
    pfIn:       fields.pfIn,
    pfOut:      fields.pfOut,
    qInVar:     fields.qInVar,
    qOutVar:    fields.qOutVar,
    eInKwh:     fields.eInKwh,
    eOutKwh:    fields.eOutKwh,
    freqIn:     fields.freqIn,
    freqOut:    fields.freqOut,
    rssi:       fields.rssi,
    ip:         fields.ip       ?? null,
    firmware:   fields.firmware ?? null,
    rawJson,
  };

  await prisma.telemetryRaw.create({ data });

  await prisma.telemetryLatest.upsert({
    where:  { deviceId },
    create: data,
    update: data,
  });
}

async function runAlarmEval(
  prisma: PrismaClient,
  fields: ReturnType<typeof normalise>,
): Promise<void> {
  const { deviceId } = fields;
  if (!deviceId) return;

  const [device, calProfile] = await Promise.all([
    prisma.device.findUnique({ where: { deviceId }, include: { upsUnit: true } }),
    prisma.calibrationProfile.findUnique({ where: { deviceId } }),
  ]);

  const vDcScale  = calProfile ? calProfile.vDcScale  : VOLT_DC_DEFAULT_SCALE;
  const vDcOffset = calProfile ? calProfile.vDcOffset : 0;
  const calibratedVoltDc = fields.voltDc * vDcScale + vDcOffset;

  await markDeviceOnline(prisma, deviceId);

  await evaluateAlarms(
    prisma,
    {
      deviceId,
      upsId:     fields.upsId,
      upsUnitId: device?.upsUnit?.id,
      siteId:    fields.siteId,
      voltIn:    fields.voltIn,
      voltOut:   fields.voltOut,
      voltDc:    calibratedVoltDc,
      ctIn:      fields.ctIn,
      ctOut:     fields.ctOut,
      sInVa:     fields.sInVa,
      sOutVa:    fields.sOutVa,
    },
    device?.upsUnit?.batteryNominalV ?? 48,
    device?.upsUnit?.capacityVa ?? 0,
    30,
    2,
  );
}

async function handleMessage(
  prisma:  PrismaClient,
  topic:   string,
  payload: Buffer,
): Promise<void> {
  let raw: object;
  try {
    raw = JSON.parse(payload.toString()) as object;
  } catch {
    console.warn(`[worker] Bad JSON on ${topic} — skipped`);
    return;
  }

  const fields = normalise(raw as RawPayload);
  if (!fields.deviceId) {
    console.warn(`[worker] No device_id on ${topic} — skipped`);
    return;
  }

  try {
    await upsertDevice(prisma, fields);
    await persistTelemetry(prisma, fields, raw);
    await runAlarmEval(prisma, fields);
    getEventBus().emit("telemetry", { deviceId: fields.deviceId, data: fields });
  } catch (err) {
    console.error(`[worker] DB error for ${fields.deviceId}:`, err instanceof Error ? err.message : err);
  }
}

async function checkOfflineDevices(prisma: PrismaClient): Promise<void> {
  const cutoff = new Date(Date.now() - OFFLINE_THRESHOLD_MS);
  const stale = await prisma.device.findMany({
    where: { online: true, lastSeenAt: { lt: cutoff } },
    include: { upsUnit: true },
  });
  for (const device of stale) {
    await prisma.device.update({ where: { id: device.id }, data: { online: false } });
    await markDeviceOffline(prisma, device.deviceId, device.upsUnit?.upsId, undefined);
    getEventBus().emit("device-offline", { clientId: device.deviceId });
    console.log(`[worker] Marked offline: ${device.deviceId}`);
  }
}

async function deduplicateAlarms(prisma: PrismaClient): Promise<void> {
  const dupes = await prisma.alarm.groupBy({
    by: ["deviceId", "metric"],
    where: { state: "active" },
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
  });
  let removed = 0;
  for (const d of dupes) {
    const rows = await prisma.alarm.findMany({
      where: { deviceId: d.deviceId, metric: d.metric, state: "active" },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true },
    });
    const [, ...toDelete] = rows;
    if (toDelete.length > 0) {
      await prisma.alarm.deleteMany({ where: { id: { in: toDelete.map((r) => r.id) } } });
      removed += toDelete.length;
    }
  }
  if (removed > 0) console.log(`[worker] Dedup: removed ${removed} duplicate alarm(s)`);
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function startTelemetryWorker(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("[worker] DATABASE_URL not set — worker disabled");
    return;
  }

  const prisma = new PrismaClient({ log: ["warn", "error"] });

  // Connect to the embedded broker via loopback — no external broker needed
  const brokerUrl = process.env.MQTT_BROKER_URL ?? "mqtt://127.0.0.1:1883";

  const topics = [
    "ums/devices/+/telemetry",     // v2 topic — new firmware
    "building/+/ups/+/telemetry",  // v1 topic — legacy firmware (HACK: keep until all boards updated)
  ];

  const client = mqtt.connect(brokerUrl, {
    clientId: `ums-worker-${Math.random().toString(16).slice(2, 10)}`,
    clean: true,
    reconnectPeriod: 3_000,
    connectTimeout:  10_000,
  });

  client.on("connect", () => {
    console.log(`[worker] Connected to broker — subscribing to ${topics.join(", ")}`);
    topics.forEach((t) => client.subscribe(t, { qos: 1 }));
  });

  client.on("reconnect", () => console.log("[worker] Reconnecting to broker…"));
  client.on("error",     (err) => console.error("[worker] MQTT error:", err.message));

  client.on("message", (topic, payload) => {
    handleMessage(prisma, topic, payload).catch((err) =>
      console.error("[worker] handleMessage error:", err instanceof Error ? err.message : err),
    );
  });

  // Periodic jobs
  setInterval(() => checkOfflineDevices(prisma).catch(console.error), OFFLINE_CHECK_MS);

  // TODO: move rollup to src/lib/rollup.ts and import here
  setInterval(async () => {
    try {
      const { runRollup } = await import("../../worker/rollup");
      await runRollup(prisma);
    } catch (err) {
      console.error("[worker] rollup error:", err instanceof Error ? err.message : err);
    }
  }, ROLLUP_MS);

  setTimeout(async () => {
    await deduplicateAlarms(prisma).catch(console.error);
    try {
      const { runRetentionCleanup } = await import("../../worker/rollup");
      await runRetentionCleanup(prisma);
    } catch (err) {
      console.error("[worker] cleanup error:", err instanceof Error ? err.message : err);
    }
    setInterval(async () => {
      try {
        const { runRetentionCleanup } = await import("../../worker/rollup");
        await runRetentionCleanup(prisma);
      } catch (err) {
        console.error("[worker] cleanup error:", err instanceof Error ? err.message : err);
      }
    }, CLEANUP_MS);
  }, 10_000);

  process.once("SIGINT",  async () => { client.end(); await prisma.$disconnect(); });
  process.once("SIGTERM", async () => { client.end(); await prisma.$disconnect(); });

  console.log("[worker] Telemetry worker started.");
}
