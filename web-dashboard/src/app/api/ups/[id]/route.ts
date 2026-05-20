import { NextResponse } from "next/server";

import { prisma, isDbEnabled } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDbEnabled()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const { id } = await params;

  const unit = await prisma.upsUnit.findFirst({
    where: { OR: [{ id }, { upsId: id }], active: true },
    include: {
      devices: {
        where: { active: true },
        include: {
          telemetryLatest: true,
          alarms: { where: { state: "active" }, orderBy: { firstSeenAt: "desc" } },
        },
      },
      alarms: {
        orderBy: { firstSeenAt: "desc" },
        take: 100,
      },
    },
  });

  if (!unit) {
    return NextResponse.json({ error: "UPS not found." }, { status: 404 });
  }

  const device = unit.devices[0];
  const tl = device?.telemetryLatest;

  return NextResponse.json({
    unit: {
      id: unit.id,
      upsId: unit.upsId,
      name: unit.name,
      serial: unit.serial,
      floor: unit.floor,
      location: unit.location,
      capacityVa: unit.capacityVa,
      batteryNominalV: unit.batteryNominalV,
      notes: unit.notes,
    },
    device: device
      ? {
          id: device.id,
          deviceId: device.deviceId,
          ip: device.ip,
          mac: device.mac,
          firmware: device.firmware,
          online: device.online,
          lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
        }
      : null,
    telemetry: tl
      ? {
          voltIn: tl.voltIn,
          voltOut: tl.voltOut,
          voltDc: tl.voltDc,
          ctIn: tl.ctIn,
          ctOut: tl.ctOut,
          sInVa: tl.sInVa,
          sOutVa: tl.sOutVa,
          rssi: tl.rssi,
          firmware: tl.firmware,
          receivedAt: tl.receivedAt.toISOString(),
          loadPct: unit.capacityVa > 0 ? (tl.sOutVa / unit.capacityVa) * 100 : null,
          pInW: null,
          pOutW: null,
          pfIn: null,
          pfOut: null,
          eInKwh: null,
          eOutKwh: null,
        }
      : null,
    activeAlarms: device?.alarms ?? [],
    alarmHistory: unit.alarms,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isDbEnabled()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const { id } = await params;
  const body = (await request.json()) as { notes?: string; name?: string };

  const unit = await prisma.upsUnit.findFirst({
    where: { OR: [{ id }, { upsId: id }] },
  });

  if (!unit) {
    return NextResponse.json({ error: "UPS not found." }, { status: 404 });
  }

  const updated = await prisma.upsUnit.update({
    where: { id: unit.id },
    data: {
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
    },
  });

  return NextResponse.json({ unit: updated });
}
