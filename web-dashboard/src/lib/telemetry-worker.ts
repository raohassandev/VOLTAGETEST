/**
 * Telemetry worker â€” runs in-process inside instrumentation.ts.
 * Subscribes to the embedded Aedes broker, ingests telemetry, persists to
 * PostgreSQL, and drives the alarm engine.
 *
 * Payload format â€” firmware v1.0.0:
 *   volt_in, volt_out, volt_dc (calibrated), ct_in, ct_out, s_in_va, s_out_va,
 *   freq_in, freq_out, p_in_w, p_out_w, pf_in, pf_out, q_in_var, q_out_var,
 *   e_in_kwh, e_out_kwh, rssi, firmware, seq, ip, mac, free_heap, reset_reason
 *
 * NOTE: This is the in-process (embedded-broker) worker. The production/Docker
 * path uses worker/mqtt-worker.ts with an external Mosquitto broker. Both workers
 * must be kept aligned with the same payload field names and alarm logic.
 */

import { PrismaClient } from "@prisma/client";
import { evaluateAlarms, markDeviceOffline, markDeviceOnline } from "./alarm-engine";
import { getEventBus } from "./event-bus";

// TODO: import rollup from worker/rollup once it is moved into src/lib
// For now we dynamically require it to avoid breaking the build while the file lives in worker/

const OFFLINE_THRESHOLD_MS = Number(process.env.OFFLINE_THRESHOLD_SECS ?? "60") * 1_000;
const OFFLINE_CHECK_MS     = 30_000;
const ROLLUP_MS            = 60_000;
const CLEANUP_MS           = 24 * 60 * 60 * 1_000;

// â”€â”€ Payload types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** v2 payload â€” new ESP32 firmware */
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

/** v1 payload â€” legacy firmware and current firmware v1.0.0 field names */
interface PayloadV1 {
  device_id?: string; ups_id?: string; site_id?: string;
  volt_in?: number;  volt_out?: number; volt_dc?: number;
  ct_in?: number;    ct_out?: number;
  s_in_va?: number;  s_out_va?: number;
  p_in_w?: number;   p_out_w?: number;
  pf_in?: number;    pf_out?: number;
  freq_in?: number;  freq_out?: number;    // v1.0.0 firmware field names
  q_in_var?: number; q_out_var?: number;
  e_in_kwh?: number; e_out_kwh?: number;
  rssi?: number; ip?: string; firmware?: string; mac?: string; seq?: number;
}

type RawPayload = PayloadV1 & PayloadV2;

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    // Voltages â€” v2 wins, fall back to v1
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
    // Frequency â€” v1.0.0 firmware: freq_in/freq_out; v2 proto used f_in_hz/f_out_hz
    freqIn:    optNum(p.freq_in  ?? p.f_in_hz),
    freqOut:   optNum(p.freq_out ?? p.f_out_hz),
    // Device
    rssi:      p.rssi !== undefined ? Math.round(num(p.rssi)) : null,
    ip:        str(p.ip),
    firmware:  str(p.fw ?? p.firmware),
    mac:       str(p.mac),
  };
}

// â”€â”€ Database operations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  const device = await prisma.device.findUnique({ where: { deviceId }, include: { upsUnit: true } });

  // Firmware v1.0.0 publishes volt_dc already calibrated in volts â€” do NOT re-apply calibration.
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
      voltDc:    fields.voltDc,   // firmware-calibrated; no server re-scaling
      ctIn:      fields.ctIn,
      ctOut:     fields.ctOut,
      sInVa:     fields.sInVa,
      sOutVa:    fields.sOutVa,
      pInW:      fields.pInW,
      pOutW:     fields.pOutW,
      pfIn:      fields.pfIn,
      pfOut:     fields.pfOut,
      freqIn:    fields.freqIn,
      freqOut:   fields.freqOut,
      qInVar:    fields.qInVar,
      qOutVar:   fields.qOutVar,
      eInKwh:    fields.eInKwh,
      eOutKwh:   fields.eOutKwh,
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
    console.warn(`[worker] Bad JSON on ${topic} â€” skipped`);
    return;
  }

  const fields = normalise(raw as RawPayload);
  if (!fields.deviceId) {
    console.warn(`[worker] No device_id on ${topic} â€” skipped`);
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

// â”€â”€ Public entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function startTelemetryWorker(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("[worker] DATABASE_URL not set â€” worker disabled");
    return;
  }

  const prisma = new PrismaClient({ log: ["warn", "error"] });

  // Subscribe to the in-process EventBus instead of opening a TCP MQTT connection.
  // The broker emits "mqtt-message" for every publish from a real client, so we
  // get all telemetry without a loopback TCP round-trip.
  const bus = getEventBus();
  bus.on("mqtt-message", ({ topic, payload }: { topic: string; payload: Buffer }) => {
    handleMessage(prisma, topic, payload).catch((err) =>
      console.error("[worker] handleMessage error:", err instanceof Error ? err.message : err),
    );
  });
  console.log("[worker] Subscribed to in-process EventBus for telemetry.");

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

  process.once("SIGINT",  async () => { await prisma.$disconnect(); });
  process.once("SIGTERM", async () => { await prisma.$disconnect(); });

  console.log("[worker] Telemetry worker started.");
}
