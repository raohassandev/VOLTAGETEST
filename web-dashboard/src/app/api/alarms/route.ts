import { NextResponse } from "next/server";

import { prisma, isDbEnabled } from "@/lib/db";

export async function GET(request: Request) {
  if (!isDbEnabled()) {
    return NextResponse.json({ alarms: [] });
  }

  const { searchParams } = new URL(request.url);
  const state = searchParams.get("state") ?? "active";
  const deviceId = searchParams.get("deviceId");
  const limit = Math.min(Number(searchParams.get("limit") || "200"), 1000);

  const where: Record<string, unknown> = {};
  if (state !== "all") where.state = state;
  if (deviceId) where.deviceId = deviceId;

  const alarms = await prisma.alarm.findMany({
    where,
    orderBy: { firstSeenAt: "desc" },
    take: limit,
    include: { device: { include: { upsUnit: true } } },
  });

  return NextResponse.json({
    alarms: alarms.map((a) => ({
      id: a.id,
      deviceId: a.deviceId,
      upsId: a.upsId,
      upsName: a.device.upsUnit?.name ?? null,
      floor: a.device.upsUnit?.floor ?? null,
      location: a.device.upsUnit?.location ?? null,
      metric: a.metric,
      severity: a.severity,
      state: a.state,
      message: a.message,
      firstSeenAt: a.firstSeenAt.toISOString(),
      lastSeenAt: a.lastSeenAt.toISOString(),
      clearedAt: a.clearedAt?.toISOString() ?? null,
      acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
      acknowledgedBy: a.acknowledgedBy,
      comment: a.comment,
    })),
  });
}
