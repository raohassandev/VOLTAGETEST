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

  // Delete dependent records in FK order to avoid constraint errors
  await prisma.telemetryRaw.deleteMany({ where: { deviceId } });
  await prisma.telemetryLatest.deleteMany({ where: { deviceId } });
  await prisma.telemetry1m.deleteMany({ where: { deviceId } });
  await prisma.alarm.deleteMany({ where: { deviceId } });
  await prisma.auditLog.deleteMany({ where: { entity: "device", entityId: deviceId } });
  await prisma.device.delete({ where: { deviceId } });

  return NextResponse.json({ ok: true, deleted: deviceId });
}
