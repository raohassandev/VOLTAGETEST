import { NextResponse } from "next/server";
import { requireApiAuth, requireRole } from "@/lib/api-auth";

import { prisma, isDbEnabled } from "@/lib/db";

export async function GET(request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  if (!isDbEnabled()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const { deviceId } = await params;

  const device = await prisma.device.findUnique({
    where: { deviceId },
    include: {
      upsUnit: true,
      telemetryLatest: true,
      alarms: { where: { state: "active" }, orderBy: { firstSeenAt: "desc" } },
    },
  });

  if (!device) {
    return NextResponse.json({ error: "Device not found." }, { status: 404 });
  }

  return NextResponse.json({ device });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = requireRole(request, "manufacturer");
  if (!auth.ok) return auth.response;

  if (!isDbEnabled()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const { deviceId } = await params;

  const device = await prisma.device.findUnique({ where: { deviceId } });
  if (!device) return NextResponse.json({ error: "Device not found." }, { status: 404 });

  // Delete dependent records before device to avoid FK constraint errors
  await prisma.$transaction([
    prisma.telemetryLatest.deleteMany({ where: { deviceId } }),
    prisma.telemetry1m.deleteMany({ where: { deviceId } }),
    prisma.alarm.deleteMany({ where: { deviceId } }),
    prisma.auditLog.deleteMany({ where: { entity: "device", entityId: deviceId } }),
    prisma.device.delete({ where: { deviceId } }),
  ]);

  return NextResponse.json({ ok: true, deleted: deviceId });
}
