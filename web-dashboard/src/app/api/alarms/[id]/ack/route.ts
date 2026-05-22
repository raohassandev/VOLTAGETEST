import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

import { prisma, isDbEnabled } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, "technician");
  if (!auth.ok) return auth.response;

  if (!isDbEnabled()) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const { id } = await params;
  const body = (await request.json()) as { comment?: string; acknowledgedBy?: string };

  const alarm = await prisma.alarm.findUnique({ where: { id } });
  if (!alarm) {
    return NextResponse.json({ error: "Alarm not found." }, { status: 404 });
  }

  const updated = await prisma.alarm.update({
    where: { id },
    data: {
      acknowledgedAt: new Date(),
      acknowledgedBy: body.acknowledgedBy ?? "operator",
      comment: body.comment ?? null,
    },
  });

  return NextResponse.json({ alarm: updated });
}
