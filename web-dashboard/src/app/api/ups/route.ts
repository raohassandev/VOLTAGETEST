import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";

import { prisma, isDbEnabled } from "@/lib/db";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  if (!isDbEnabled()) {
    return NextResponse.json({ units: [] });
  }

  const units = await prisma.upsUnit.findMany({
    where: { active: true },
    orderBy: { upsId: "asc" },
    include: {
      devices: {
        where: { active: true },
        include: { telemetryLatest: true },
      },
    },
  });

  return NextResponse.json({
    units: units.map((u) => {
      const device = u.devices[0];
      const tl = device?.telemetryLatest;
      return {
        id: u.id,
        upsId: u.upsId,
        name: u.name,
        serial: u.serial,
        floor: u.floor,
        location: u.location,
        capacityVa: u.capacityVa,
        batteryNominalV: u.batteryNominalV,
        notes: u.notes,
        deviceId: device?.deviceId ?? null,
        online: device?.online ?? false,
        lastSeenAt: device?.lastSeenAt?.toISOString() ?? null,
        voltIn: tl?.voltIn ?? null,
        voltOut: tl?.voltOut ?? null,
        voltDc: tl?.voltDc ?? null,
        ctIn: tl?.ctIn ?? null,
        ctOut: tl?.ctOut ?? null,
        sInVa: tl?.sInVa ?? null,
        sOutVa: tl?.sOutVa ?? null,
        rssi: tl?.rssi ?? null,
        firmware: tl?.firmware ?? null,
      };
    }),
  });
}
