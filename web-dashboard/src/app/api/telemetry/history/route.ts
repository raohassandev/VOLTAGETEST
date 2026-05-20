import { NextResponse } from "next/server";

import { prisma, isDbEnabled } from "@/lib/db";
import { getTelemetryStore } from "@/lib/mqtt-ingestion";
import type { RawTelemetry } from "@/lib/telemetry-types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId") ?? searchParams.get("device_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Math.min(Number(searchParams.get("limit") || "500"), 5000);

  if (isDbEnabled()) {
    const where: Record<string, unknown> = {};
    if (deviceId) where.deviceId = deviceId;
    if (from || to) {
      where.receivedAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const rows = await prisma.telemetryRaw.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: limit,
    });

    const history: RawTelemetry[] = rows.map((row) => ({
      volt_in: row.voltIn,
      volt_out: row.voltOut,
      volt_dc: row.voltDc,
      ct_in: row.ctIn,
      ct_out: row.ctOut,
      s_in_va: row.sInVa,
      s_out_va: row.sOutVa,
      device_id: row.deviceId,
      ups_id: row.upsId ?? undefined,
      site_id: row.siteId ?? undefined,
      ip: row.ip ?? "",
      firmware: row.firmware ?? undefined,
      rssi: row.rssi ?? undefined,
      received_at: row.receivedAt.toISOString(),
      uptime_ms: 0,
    }));

    if (deviceId) return NextResponse.json({ history });
    return NextResponse.json({ history });
  }

  const store = await getTelemetryStore();
  if (deviceId) {
    return NextResponse.json({ history: store.history[deviceId] || [] });
  }
  return NextResponse.json({ history: store.history });
}
