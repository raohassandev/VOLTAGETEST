/**
 * MQTT Worker — runs as a separate process alongside Next.js.
 * Connects to the MQTT broker, ingests telemetry, persists to PostgreSQL,
 * runs the alarm engine, and periodically marks offline devices.
 *
 * Start:  npm run worker:start
 * Dev:    npm run worker:dev   (auto-restarts on file change)
 */

import mqtt from "mqtt";
import { PrismaClient } from "@prisma/client";
import { evaluateAlarms, markDeviceOffline, markDeviceOnline } from "../src/lib/alarm-engine";
import { runRollup, runRetentionCleanup } from "./rollup";

const BROKER_URL = process.env.MQTT_BROKER_URL;
const TOPIC = process.env.MQTT_TOPIC || "building/+/ups/+/telemetry";
const OFFLINE_THRESHOLD_MS = Number(process.env.OFFLINE_THRESHOLD_SECS || "60") * 1000;
const OFFLINE_CHECK_INTERVAL_MS = 30_000;
const ROLLUP_INTERVAL_MS = 60_000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

if (!BROKER_URL) {
  console.error("[worker] MQTT_BROKER_URL is not set — exiting.");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("[worker] DATABASE_URL is not set — exiting.");
  process.exit(1);
}

const prisma = new PrismaClient({
  log: ["warn", "error"],
});

interface RawPayload {
  device_id?: string;
  ups_id?: string;
  site_id?: string;
  volt_in?: number;
  volt_out?: number;
  volt_dc?: number;
  ct_in?: number;
  ct_out?: number;
  s_in_va?: number;
  s_out_va?: number;
  p_in_w?: number;
  p_out_w?: number;
  pf_in?: number;
  pf_out?: number;
  e_in_kwh?: number;
  e_out_kwh?: number;
  rssi?: number;
  ip?: string;
  firmware?: string;
  uptime_ms?: number;
  seq?: number;
  free_heap?: number;
  mac?: string;
  reset_reason?: string;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

async function upsertDevice(payload: RawPayload): Promise<string | null> {
  const deviceId = payload.device_id ?? payload.ups_id;
  if (!deviceId) return null;

  await prisma.device.upsert({
    where: { deviceId },
    create: {
      deviceId,
      ip: str(payload.ip),
      mac: str(payload.mac),
      firmware: str(payload.firmware),
      lastSeenAt: new Date(),
      online: true,
    },
    update: {
      ip: str(payload.ip),
      mac: str(payload.mac),
      firmware: str(payload.firmware),
      lastSeenAt: new Date(),
      online: true,
    },
  });

  if (payload.ups_id) {
    const upsUnit = await prisma.upsUnit.findUnique({
      where: { upsId: payload.ups_id },
    });
    if (upsUnit) {
      await prisma.device.update({
        where: { deviceId },
        data: { upsUnitId: upsUnit.id, siteId: upsUnit.siteId },
      });
    }
  }

  return deviceId;
}

async function persistTelemetry(deviceId: string, payload: RawPayload, rawJson: object): Promise<void> {
  const now = new Date();
  const data = {
    deviceId,
    upsId: str(payload.ups_id),
    siteId: str(payload.site_id),
    receivedAt: now,
    seq: payload.seq !== undefined ? num(payload.seq) : undefined,
    voltIn: num(payload.volt_in),
    voltOut: num(payload.volt_out),
    voltDc: num(payload.volt_dc),
    ctIn: num(payload.ct_in),
    ctOut: num(payload.ct_out),
    sInVa: num(payload.s_in_va),
    sOutVa: num(payload.s_out_va),
    pInW: payload.p_in_w !== undefined ? num(payload.p_in_w) : null,
    pOutW: payload.p_out_w !== undefined ? num(payload.p_out_w) : null,
    pfIn: payload.pf_in !== undefined ? num(payload.pf_in) : null,
    pfOut: payload.pf_out !== undefined ? num(payload.pf_out) : null,
    eInKwh: payload.e_in_kwh !== undefined ? num(payload.e_in_kwh) : null,
    eOutKwh: payload.e_out_kwh !== undefined ? num(payload.e_out_kwh) : null,
    rssi: payload.rssi !== undefined ? Math.round(num(payload.rssi)) : null,
    ip: str(payload.ip),
    firmware: str(payload.firmware),
    rawJson,
  };

  await prisma.telemetryRaw.create({ data });

  await prisma.telemetryLatest.upsert({
    where: { deviceId },
    create: data,
    update: data,
  });
}

async function runAlarmEvaluation(deviceId: string, payload: RawPayload): Promise<void> {
  const device = await prisma.device.findUnique({
    where: { deviceId },
    include: { upsUnit: true },
  });

  const batteryNominalV = device?.upsUnit?.batteryNominalV ?? 48;
  const capacityVa = device?.upsUnit?.capacityVa ?? 0;

  // Global fallback debounce/hysteresis — per-rule values from AlarmRule table
  // take precedence inside evaluateAlarms. These are used only when no rule exists.
  const FALLBACK_DEBOUNCE_SECS = 30;
  const FALLBACK_HYSTERESIS_PCT = 2;

  await markDeviceOnline(prisma, deviceId);

  await evaluateAlarms(
    prisma,
    {
      deviceId,
      upsId: str(payload.ups_id),
      upsUnitId: device?.upsUnit?.id,
      siteId: str(payload.site_id),
      voltIn: num(payload.volt_in),
      voltOut: num(payload.volt_out),
      voltDc: num(payload.volt_dc),
      ctIn: num(payload.ct_in),
      ctOut: num(payload.ct_out),
      sInVa: num(payload.s_in_va),
      sOutVa: num(payload.s_out_va),
    },
    batteryNominalV,
    capacityVa,
    FALLBACK_DEBOUNCE_SECS,
    FALLBACK_HYSTERESIS_PCT,
  );
}

async function handleMessage(topic: string, payloadBuffer: Buffer): Promise<void> {
  let raw: object;
  try {
    raw = JSON.parse(payloadBuffer.toString()) as object;
  } catch {
    console.warn(`[worker] Invalid JSON on topic ${topic} — skipped`);
    return;
  }

  const payload = raw as RawPayload;
  const deviceId = await upsertDevice(payload);
  if (!deviceId) {
    console.warn(`[worker] No device_id in payload on ${topic} — skipped`);
    return;
  }

  try {
    await persistTelemetry(deviceId, payload, raw);
    await runAlarmEvaluation(deviceId, payload);
  } catch (err) {
    console.error(`[worker] DB error for ${deviceId}:`, err instanceof Error ? err.message : err);
  }
}

async function checkOfflineDevices(): Promise<void> {
  const cutoff = new Date(Date.now() - OFFLINE_THRESHOLD_MS);
  const stale = await prisma.device.findMany({
    where: {
      online: true,
      lastSeenAt: { lt: cutoff },
    },
    include: { upsUnit: true },
  });

  for (const device of stale) {
    await prisma.device.update({
      where: { id: device.id },
      data: { online: false },
    });
    await markDeviceOffline(prisma, device.deviceId, device.upsUnit?.upsId, undefined);
    console.log(`[worker] Marked offline: ${device.deviceId}`);
  }
}

function startWorker(): void {
  console.log(`[worker] Connecting to ${BROKER_URL}`);

  const client = mqtt.connect(BROKER_URL!, {
    clientId: `ups-worker-${Math.random().toString(16).slice(2, 10)}`,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10_000,
  });

  client.on("connect", () => {
    console.log(`[worker] Connected — subscribing to ${TOPIC}`);
    client.subscribe(TOPIC, { qos: 1 }, (err) => {
      if (err) console.error("[worker] Subscribe error:", err.message);
    });
  });

  client.on("reconnect", () => console.log("[worker] Reconnecting…"));
  client.on("offline", () => console.warn("[worker] Offline"));
  client.on("error", (err) => console.error("[worker] MQTT error:", err.message));

  client.on("message", (topic, payload) => {
    handleMessage(topic, payload).catch((err) =>
      console.error("[worker] handleMessage error:", err instanceof Error ? err.message : err),
    );
  });

  setInterval(() => {
    checkOfflineDevices().catch((err) =>
      console.error("[worker] offline-check error:", err instanceof Error ? err.message : err),
    );
  }, OFFLINE_CHECK_INTERVAL_MS);

  setInterval(() => {
    runRollup(prisma).catch((err) =>
      console.error("[worker] rollup error:", err instanceof Error ? err.message : err),
    );
  }, ROLLUP_INTERVAL_MS);

  // Retention cleanup: run once at startup (after 10s) and then every 24 hours.
  setTimeout(() => {
    runRetentionCleanup(prisma).catch((err) =>
      console.error("[worker] cleanup error:", err instanceof Error ? err.message : err),
    );
    setInterval(() => {
      runRetentionCleanup(prisma).catch((err) =>
        console.error("[worker] cleanup error:", err instanceof Error ? err.message : err),
      );
    }, CLEANUP_INTERVAL_MS);
  }, 10_000);

  console.log("[worker] Started.");
}

process.on("SIGINT", async () => {
  console.log("[worker] Shutting down…");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

startWorker();
