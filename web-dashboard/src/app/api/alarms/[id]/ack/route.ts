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
  const body = (await request.json()) as { comment?: string };

  const alarm = await prisma.alarm.findUnique({ where: { id } });
  if (!alarm) {
    return NextResponse.json({ error: "Alarm not found." }, { status: 404 });
  }

  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 500) || null : null;
  const now = new Date();

  const [updated] = await prisma.$transaction([
    prisma.alarm.update({
      where: { id },
      data: {
        acknowledgedAt: now,
        acknowledgedBy: auth.user.username,
        comment,
      },
    }),
    prisma.alarmEvent.create({
      data: {
        alarmId: id,
        event: "acknowledged",
        message: comment
          ? `Acknowledged by ${auth.user.username}: "${comment}"`
          : `Acknowledged by ${auth.user.username}`,
        userId: auth.user.username,
        createdAt: now,
      },
    }),
  ]);

  return NextResponse.json({ alarm: updated });
}
