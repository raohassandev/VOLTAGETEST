import { NextResponse } from "next/server";
import { requireApiAuth, requireRole } from "@/lib/api-auth";

import { prisma, isDbEnabled } from "@/lib/db";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  if (!isDbEnabled()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId");
  const upsUnitId = searchParams.get("upsUnitId");
  const siteId = searchParams.get("siteId");

  const rules = await prisma.alarmRule.findMany({
    where: {
      ...(deviceId ? { deviceId } : {}),
      ...(upsUnitId ? { upsUnitId } : {}),
      ...(siteId ? { siteId } : {}),
    },
    orderBy: [{ metric: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ rules });
}

export async function POST(request: Request) {
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;

  if (!isDbEnabled()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  const body = (await request.json()) as {
    metric: string;
    label: string;
    key?: string;
    deviceId?: string | null;
    upsUnitId?: string | null;
    siteId?: string | null;
    lowWarning?: number | null;
    lowCritical?: number | null;
    highWarning?: number | null;
    highCritical?: number | null;
    debounceSeconds?: number;
    hysteresisPercent?: number;
    enabled?: boolean;
  };

  if (!body.metric || !body.label) {
    return NextResponse.json({ error: "metric and label are required" }, { status: 400 });
  }

  const validationError = validateThresholds(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const rule = await prisma.alarmRule.create({
    data: {
      metric: body.metric,
      label: body.label,
      key: body.key ?? `${body.metric}_${Date.now()}`,
      deviceId: body.deviceId ?? null,
      upsUnitId: body.upsUnitId ?? null,
      siteId: body.siteId ?? null,
      lowWarning: body.lowWarning ?? null,
      lowCritical: body.lowCritical ?? null,
      highWarning: body.highWarning ?? null,
      highCritical: body.highCritical ?? null,
      debounceSeconds: body.debounceSeconds ?? 30,
      hysteresisPercent: body.hysteresisPercent ?? 2,
      enabled: body.enabled ?? true,
    },
  });

  return NextResponse.json({ rule }, { status: 201 });
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
