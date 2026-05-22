import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

import { prisma, isDbEnabled } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;

  if (!isDbEnabled()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  const { id } = await params;
  const body = (await request.json()) as {
    label?: string;
    lowWarning?: number | null;
    lowCritical?: number | null;
    highWarning?: number | null;
    highCritical?: number | null;
    debounceSeconds?: number;
    hysteresisPercent?: number;
    enabled?: boolean;
  };

  const validationError = validateThresholds(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  try {
    const rule = await prisma.alarmRule.update({
      where: { id },
      data: {
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.lowWarning !== undefined ? { lowWarning: body.lowWarning } : {}),
        ...(body.lowCritical !== undefined ? { lowCritical: body.lowCritical } : {}),
        ...(body.highWarning !== undefined ? { highWarning: body.highWarning } : {}),
        ...(body.highCritical !== undefined ? { highCritical: body.highCritical } : {}),
        ...(body.debounceSeconds !== undefined ? { debounceSeconds: body.debounceSeconds } : {}),
        ...(body.hysteresisPercent !== undefined ? { hysteresisPercent: body.hysteresisPercent } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      },
    });
    return NextResponse.json({ rule });
  } catch {
    return NextResponse.json({ error: "Rule not found." }, { status: 404 });
  }
}

export async function DELETE(request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;

  if (!isDbEnabled()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  const { id } = await params;
  try {
    await prisma.alarmRule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Rule not found." }, { status: 404 });
  }
}

function validateThresholds(b: {
  lowCritical?: number | null;
  lowWarning?: number | null;
  highWarning?: number | null;
  highCritical?: number | null;
}): string | null {
  const { lowCritical: lc, lowWarning: lw, highWarning: hw, highCritical: hc } = b;
  if (lc !== null && lc !== undefined && lw !== null && lw !== undefined && lc >= lw)
    return "lowCritical must be less than lowWarning";
  if (hw !== null && hw !== undefined && hc !== null && hc !== undefined && hw >= hc)
    return "highWarning must be less than highCritical";
  if (lw !== null && lw !== undefined && hw !== null && hw !== undefined && lw >= hw)
    return "lowWarning must be less than highWarning";
  return null;
}
