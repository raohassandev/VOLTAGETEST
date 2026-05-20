import { NextResponse } from "next/server";

import { prisma, isDbEnabled } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
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
