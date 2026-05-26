import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma, isDbEnabled } from "@/lib/db";
import { logAudit, requestIp } from "@/lib/audit";

export async function POST(request: Request) {
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;

  if (!isDbEnabled()) {
    return NextResponse.json({ error: "Database not enabled" }, { status: 501 });
  }

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

  const [rawResult, rollupResult, alarmResult] = await Promise.all([
    prisma.telemetryRaw.deleteMany({ where: { receivedAt: { lt: rawCutoff } } }),
    prisma.telemetry1m.deleteMany({ where: { bucketStart: { lt: rollupCutoff } } }),
    prisma.alarm.deleteMany({ where: { state: { not: "active" }, firstSeenAt: { lt: alarmCutoff } } }),
  ]);

  // Purge orphaned AlarmEvent rows
  await prisma.$executeRaw`
    DELETE FROM "AlarmEvent" WHERE "alarmId" NOT IN (SELECT "id" FROM "Alarm")
  `;

  await logAudit({
    userId: auth.user.username,
    action: "system.purge",
    entity: "SystemSettings",
    entityId: "default",
    data: { rawDeleted: rawResult.count, rollupDeleted: rollupResult.count, alarmDeleted: alarmResult.count },
    ip: requestIp(request),
  });

  return NextResponse.json({
    deleted: {
      raw: rawResult.count,
      rollup: rollupResult.count,
      alarms: alarmResult.count,
    },
  });
}
