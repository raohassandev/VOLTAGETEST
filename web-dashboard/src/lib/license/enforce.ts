import type { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { getLicenseStatus } from "./status";
import type { LicenseFeature } from "./types";

export async function requireCanAddUps(prisma: PrismaClient, additionalActiveUps = 1) {
  const status = await getLicenseStatus(prisma);
  const maxUps = status.maxUps ?? 0;
  const projectedUsed = status.usedUps + additionalActiveUps;
  if (!status.enforcementEnabled) return null;
  if (status.state !== "active") {
    return NextResponse.json({ error: "License does not allow adding UPS units.", license: status }, { status: 402 });
  }
  if (projectedUsed > maxUps) {
    return NextResponse.json({ error: "Licensed UPS seat limit reached.", license: { ...status, usedUps: projectedUsed } }, { status: 402 });
  }
  return null;
}

export async function requireFeature(prisma: PrismaClient, feature: LicenseFeature) {
  const status = await getLicenseStatus(prisma);
  if (!status.enforcementEnabled) return null;
  if (status.state !== "active") {
    return NextResponse.json({ error: "License is not active for this feature.", feature, license: status }, { status: 402 });
  }
  if (!status.features[feature]) {
    return NextResponse.json({ error: `License does not include ${feature}.`, feature, license: status }, { status: 402 });
  }
  return null;
}

export async function syncLicenseSeat(prisma: PrismaClient, upsId: string, deviceId?: string | null, assignedBy?: string) {
  const existing = await prisma.licenseSeat.findUnique({ where: { upsId } });
  if (existing) {
    return prisma.licenseSeat.update({
      where: { upsId },
      data: { deviceId: deviceId || null, status: "active", releasedAt: null, releaseEligibleAt: null },
    });
  }
  const highest = await prisma.licenseSeat.aggregate({ _max: { seatNo: true } });
  return prisma.licenseSeat.create({
    data: {
      seatNo: (highest._max.seatNo ?? 0) + 1,
      upsId,
      deviceId: deviceId || null,
      assignedBy,
      status: "active",
    },
  });
}

export async function releaseLicenseSeat(prisma: PrismaClient, upsId: string) {
  const releaseEligibleAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.licenseSeat.updateMany({
    where: { upsId, status: "active" },
    data: { status: "released", releasedAt: new Date(), releaseEligibleAt },
  });
}
