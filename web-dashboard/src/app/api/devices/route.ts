import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";

import { prisma, isDbEnabled } from "@/lib/db";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  if (!isDbEnabled()) {
    return NextResponse.json({ devices: [] });
  }

  const devices = await prisma.device.findMany({
    where: { active: true },
    orderBy: { deviceId: "asc" },
    include: { upsUnit: true },
  });

  return NextResponse.json({
    devices: devices.map((d) => ({
      id: d.id,
      deviceId: d.deviceId,
      upsId: d.upsUnit?.upsId ?? null,
      upsName: d.upsUnit?.name ?? null,
      siteId: d.siteId,
      mac: d.mac,
      ip: d.ip,
      firmware: d.firmware,
      lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      online: d.online,
      floor: d.upsUnit?.floor ?? null,
      location: d.upsUnit?.location ?? null,
    })),
  });
}
