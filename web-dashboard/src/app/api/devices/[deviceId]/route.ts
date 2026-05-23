import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";

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

/**
 * DELETE /api/devices/:deviceId
 * Soft-deletes a device by marking active=false.
 * Requires admin or manufacturer role.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  if (!isDbEnabled()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const { deviceId } = await params;

  const device = await prisma.device.findUnique({ where: { deviceId } });
  if (!device) {
    return NextResponse.json({ error: "Device not found." }, { status: 404 });
  }

  // Soft-delete: set active=false so it disappears from boards and telemetry views
  await prisma.device.update({
    where: { deviceId },
    data: { active: false, online: false },
  });

  return NextResponse.json({ ok: true, message: `Device ${deviceId} deactivated.` });
}
