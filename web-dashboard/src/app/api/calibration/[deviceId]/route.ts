import { NextResponse } from "next/server";

import { prisma, isDbEnabled } from "@/lib/db";
import { requireApiAuth, requireRole } from "@/lib/api-auth";
import { logAudit, requestIp } from "@/lib/audit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;
  if (!isDbEnabled()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  const { deviceId } = await params;
  const profile = await prisma.calibrationProfile.findUnique({ where: { deviceId } });
  return NextResponse.json({ profile });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;
  if (!isDbEnabled()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  const { deviceId } = await params;
  const body = (await request.json()) as {
    vInScale?: number; vInOffset?: number;
    vOutScale?: number; vOutOffset?: number;
    vDcScale?: number; vDcOffset?: number;
    iInScale?: number; iInOffset?: number;
    iOutScale?: number; iOutOffset?: number;
  };

  const data = {
    vInScale: body.vInScale ?? 1, vInOffset: body.vInOffset ?? 0,
    vOutScale: body.vOutScale ?? 1, vOutOffset: body.vOutOffset ?? 0,
    vDcScale: body.vDcScale ?? 1, vDcOffset: body.vDcOffset ?? 0,
    iInScale: body.iInScale ?? 1, iInOffset: body.iInOffset ?? 0,
    iOutScale: body.iOutScale ?? 1, iOutOffset: body.iOutOffset ?? 0,
  };

  const profile = await prisma.calibrationProfile.upsert({
    where: { deviceId },
    create: { deviceId, ...data },
    update: data,
  });
  await logAudit({ userId: auth.user.username, action: "calibration.update", entity: "CalibrationProfile", entityId: deviceId, data, ip: requestIp(request) });
  return NextResponse.json({ profile });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;
  if (!isDbEnabled()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  const { deviceId } = await params;
  try {
    await prisma.calibrationProfile.delete({ where: { deviceId } });
    await logAudit({ userId: auth.user.username, action: "calibration.delete", entity: "CalibrationProfile", entityId: deviceId, ip: requestIp(request) });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }
}
