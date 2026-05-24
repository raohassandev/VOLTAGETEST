import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma, isDbEnabled } from "@/lib/db";

export async function GET(request: Request) {
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;

  if (!isDbEnabled()) {
    return NextResponse.json({ error: "Database not enabled" }, { status: 501 });
  }

  const [rawCount, rollupCount, alarmCount, oldestRaw, oldestRollup] = await Promise.all([
    prisma.telemetryRaw.count(),
    prisma.telemetry1m.count(),
    prisma.alarm.count(),
    prisma.telemetryRaw.findFirst({ orderBy: { receivedAt: "asc" }, select: { receivedAt: true } }),
    prisma.telemetry1m.findFirst({ orderBy: { bucketStart: "asc" }, select: { bucketStart: true } }),
  ]);

  return NextResponse.json({
    rawCount,
    rollupCount,
    alarmCount,
    oldestRaw: oldestRaw?.receivedAt?.toISOString() ?? null,
    oldestRollup: oldestRollup?.bucketStart?.toISOString() ?? null,
  });
}
