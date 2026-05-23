import type { PrismaClient } from "@prisma/client";

interface RollupRow {
  deviceId: string;
  bucketStart: Date;
  sampleCount: bigint;
  voltInAvg: number;
  voltInMin: number;
  voltInMax: number;
  voltOutAvg: number;
  voltOutMin: number;
  voltOutMax: number;
  voltDcAvg: number;
  voltDcMin: number;
  voltDcMax: number;
  ctInAvg: number;
  ctInMax: number;
  ctOutAvg: number;
  ctOutMax: number;
  sInVaAvg: number;
  sInVaMax: number;
  sOutVaAvg: number;
  sOutVaMax: number;
  rssiAvg: number | null;
  freqInAvg: number | null;
  freqOutAvg: number | null;
  pInWAvg: number | null;
  pInWMax: number | null;
  pOutWAvg: number | null;
  pOutWMax: number | null;
  pfInAvg: number | null;
  pfOutAvg: number | null;
  qInVarAvg: number | null;
  qOutVarAvg: number | null;
  eInKwhLast: number | null;
  eOutKwhLast: number | null;
}

/**
 * Aggregate completed minute buckets from TelemetryRaw into Telemetry1m.
 * Only processes buckets where bucketStart + 60s < now (i.e. the minute is fully closed).
 * Looks back 2 hours to catch any gaps. Safe to run repeatedly — uses upsert.
 */
export async function runRollup(prisma: PrismaClient): Promise<void> {
  let rows: RollupRow[];
  try {
    rows = await prisma.$queryRaw<RollupRow[]>`
      SELECT
        "deviceId",
        date_trunc('minute', "receivedAt") AS "bucketStart",
        COUNT(*)                           AS "sampleCount",
        AVG("voltIn")   AS "voltInAvg",  MIN("voltIn")   AS "voltInMin",  MAX("voltIn")   AS "voltInMax",
        AVG("voltOut")  AS "voltOutAvg", MIN("voltOut")  AS "voltOutMin", MAX("voltOut")  AS "voltOutMax",
        AVG("voltDc")   AS "voltDcAvg",  MIN("voltDc")   AS "voltDcMin",  MAX("voltDc")   AS "voltDcMax",
        AVG("ctIn")     AS "ctInAvg",                                     MAX("ctIn")     AS "ctInMax",
        AVG("ctOut")    AS "ctOutAvg",                                     MAX("ctOut")    AS "ctOutMax",
        AVG("sInVa")    AS "sInVaAvg",                                     MAX("sInVa")    AS "sInVaMax",
        AVG("sOutVa")   AS "sOutVaAvg",                                    MAX("sOutVa")   AS "sOutVaMax",
        AVG("rssi")     AS "rssiAvg",
        AVG("freqIn")   AS "freqInAvg",
        AVG("freqOut")  AS "freqOutAvg",
        AVG("pInW")     AS "pInWAvg",    MAX("pInW")     AS "pInWMax",
        AVG("pOutW")    AS "pOutWAvg",   MAX("pOutW")    AS "pOutWMax",
        AVG("pfIn")     AS "pfInAvg",    AVG("pfOut")    AS "pfOutAvg",
        AVG("qInVar")   AS "qInVarAvg",  AVG("qOutVar")  AS "qOutVarAvg",
        MAX("eInKwh")   AS "eInKwhLast", MAX("eOutKwh")  AS "eOutKwhLast"
      FROM "TelemetryRaw"
      WHERE "receivedAt" >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '2 hours'
        AND date_trunc('minute', "receivedAt") < date_trunc('minute', NOW() AT TIME ZONE 'UTC')
      GROUP BY "deviceId", date_trunc('minute', "receivedAt")
    `;
  } catch (err) {
    console.error("[rollup] query failed:", err);
    return;
  }

  if (rows.length === 0) return;

  // group rows by bucket for per-bucket logging
  const bucketCounts = new Map<string, number>();
  for (const row of rows) {
    const key = row.bucketStart.toISOString().slice(0, 16) + ":00Z";
    bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1);
  }

  for (const row of rows) {
    try {
      await prisma.telemetry1m.upsert({
        where: { deviceId_bucketStart: { deviceId: row.deviceId, bucketStart: row.bucketStart } },
        create: {
          deviceId: row.deviceId,
          bucketStart: row.bucketStart,
          sampleCount: Number(row.sampleCount),
          voltInAvg: row.voltInAvg,   voltInMin: row.voltInMin,   voltInMax: row.voltInMax,
          voltOutAvg: row.voltOutAvg, voltOutMin: row.voltOutMin, voltOutMax: row.voltOutMax,
          voltDcAvg: row.voltDcAvg,   voltDcMin: row.voltDcMin,   voltDcMax: row.voltDcMax,
          ctInAvg: row.ctInAvg,   ctInMax: row.ctInMax,
          ctOutAvg: row.ctOutAvg, ctOutMax: row.ctOutMax,
          sInVaAvg: row.sInVaAvg,   sInVaMax: row.sInVaMax,
          sOutVaAvg: row.sOutVaAvg, sOutVaMax: row.sOutVaMax,
          rssiAvg:     row.rssiAvg     ?? null,
          freqInAvg:   row.freqInAvg   ?? null,
          freqOutAvg:  row.freqOutAvg  ?? null,
          pInWAvg:     row.pInWAvg     ?? null,
          pInWMax:     row.pInWMax     ?? null,
          pOutWAvg:    row.pOutWAvg    ?? null,
          pOutWMax:    row.pOutWMax    ?? null,
          pfInAvg:     row.pfInAvg     ?? null,
          pfOutAvg:    row.pfOutAvg    ?? null,
          qInVarAvg:   row.qInVarAvg   ?? null,
          qOutVarAvg:  row.qOutVarAvg  ?? null,
          eInKwhLast:  row.eInKwhLast  ?? null,
          eOutKwhLast: row.eOutKwhLast ?? null,
        },
        update: {
          sampleCount: Number(row.sampleCount),
          voltInAvg: row.voltInAvg,   voltInMin: row.voltInMin,   voltInMax: row.voltInMax,
          voltOutAvg: row.voltOutAvg, voltOutMin: row.voltOutMin, voltOutMax: row.voltOutMax,
          voltDcAvg: row.voltDcAvg,   voltDcMin: row.voltDcMin,   voltDcMax: row.voltDcMax,
          ctInAvg: row.ctInAvg,   ctInMax: row.ctInMax,
          ctOutAvg: row.ctOutAvg, ctOutMax: row.ctOutMax,
          sInVaAvg: row.sInVaAvg,   sInVaMax: row.sInVaMax,
          sOutVaAvg: row.sOutVaAvg, sOutVaMax: row.sOutVaMax,
          rssiAvg:     row.rssiAvg     ?? null,
          freqInAvg:   row.freqInAvg   ?? null,
          freqOutAvg:  row.freqOutAvg  ?? null,
          pInWAvg:     row.pInWAvg     ?? null,
          pInWMax:     row.pInWMax     ?? null,
          pOutWAvg:    row.pOutWAvg    ?? null,
          pOutWMax:    row.pOutWMax    ?? null,
          pfInAvg:     row.pfInAvg     ?? null,
          pfOutAvg:    row.pfOutAvg    ?? null,
          qInVarAvg:   row.qInVarAvg   ?? null,
          qOutVarAvg:  row.qOutVarAvg  ?? null,
          eInKwhLast:  row.eInKwhLast  ?? null,
          eOutKwhLast: row.eOutKwhLast ?? null,
        },
      });
    } catch (err) {
      console.error(`[rollup] upsert failed for ${row.deviceId} @ ${row.bucketStart.toISOString()}:`, err);
    }
  }

  for (const [bucket, count] of bucketCounts) {
    console.log(`[rollup] aggregated ${bucket} — ${count} device bucket${count !== 1 ? "s" : ""}`);
  }
}

/**
 * Delete old records according to SystemSettings retention policy.
 * Safe to run at startup and every 24 hours.
 */
export async function runRetentionCleanup(prisma: PrismaClient): Promise<void> {
  const settings = await prisma.systemSettings.findUnique({ where: { id: "default" } });

  const rawDays = settings?.rawRetentionDays ?? 30;
  const rollupMonths = settings?.rollupRetentionMonths ?? 12;
  const alarmMonths = settings?.alarmRetentionMonths ?? 24;

  const rawCutoff = new Date();
  rawCutoff.setDate(rawCutoff.getDate() - rawDays);

  const rollupCutoff = new Date();
  rollupCutoff.setMonth(rollupCutoff.getMonth() - rollupMonths);

  const alarmCutoff = new Date();
  alarmCutoff.setMonth(alarmCutoff.getMonth() - alarmMonths);

  try {
    const rawDeleted = await prisma.telemetryRaw.deleteMany({
      where: { receivedAt: { lt: rawCutoff } },
    });
    console.log(`[cleanup] telemetry_raw: ${rawDeleted.count} rows deleted (older than ${rawDays}d)`);
  } catch (err) {
    console.error("[cleanup] telemetry_raw delete failed:", err);
  }

  try {
    const rollupDeleted = await prisma.telemetry1m.deleteMany({
      where: { bucketStart: { lt: rollupCutoff } },
    });
    console.log(`[cleanup] telemetry_1m: ${rollupDeleted.count} rows deleted (older than ${rollupMonths}mo)`);
  } catch (err) {
    console.error("[cleanup] telemetry_1m delete failed:", err);
  }

  try {
    const alarmDeleted = await prisma.alarm.deleteMany({
      where: {
        state: { not: "active" },
        firstSeenAt: { lt: alarmCutoff },
      },
    });
    console.log(`[cleanup] alarms: ${alarmDeleted.count} rows deleted (older than ${alarmMonths}mo)`);
  } catch (err) {
    console.error("[cleanup] alarm delete failed:", err);
  }

  // Delete AlarmEvent rows whose parent Alarm has already been deleted.
  // AlarmEvent has no FK cascade, so orphaned rows must be purged manually.
  try {
    const eventDeleted = await prisma.$executeRaw`
      DELETE FROM "AlarmEvent"
      WHERE "alarmId" NOT IN (SELECT "id" FROM "Alarm")
    `;
    if (eventDeleted > 0) {
      console.log(`[cleanup] alarm_events: ${eventDeleted} orphaned row(s) deleted`);
    }
  } catch (err) {
    console.error("[cleanup] alarm_event delete failed:", err);
  }
}
