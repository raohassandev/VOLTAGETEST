import { NextResponse } from "next/server";

import { prisma, isDbEnabled } from "@/lib/db";
import { getTelemetryStore } from "@/lib/mqtt-ingestion";
import type { RawTelemetry } from "@/lib/telemetry-types";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId") ?? searchParams.get("device_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = Math.min(Number(searchParams.get("limit") || "500"), 5000);

  if (!isDbEnabled()) {
    const store = await getTelemetryStore();
    if (deviceId) {
      return NextResponse.json({ source: "raw", history: store.history[deviceId] || [] });
    }
    return NextResponse.json({ source: "raw", history: store.history });
  }

  const fromDate = from ? new Date(from) : new Date(Date.now() - SIX_HOURS_MS);
  const toDate = to ? new Date(to) : new Date();
  const rangeMs = toDate.getTime() - fromDate.getTime();

  if (rangeMs <= SIX_HOURS_MS) {
    // Short range: use high-resolution raw telemetry
    const rows = await prisma.telemetryRaw.findMany({
      where: {
        ...(deviceId ? { deviceId } : {}),
        receivedAt: { gte: fromDate, lte: toDate },
      },
      orderBy: { receivedAt: "asc" },
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

    return NextResponse.json({ source: "raw", history });
  }

  // Long range: use 1-minute rollup
  const rollupRows = await prisma.telemetry1m.findMany({
    where: {
      ...(deviceId ? { deviceId } : {}),
      bucketStart: { gte: fromDate, lte: toDate },
    },
    orderBy: { bucketStart: "asc" },
    take: limit,
  });

  const history = rollupRows.map((row) => ({
    deviceId: row.deviceId,
    bucketStart: row.bucketStart.toISOString(),
    sampleCount: row.sampleCount,
    voltIn: { avg: row.voltInAvg, min: row.voltInMin, max: row.voltInMax },
    voltOut: { avg: row.voltOutAvg, min: row.voltOutMin, max: row.voltOutMax },
    voltDc: { avg: row.voltDcAvg, min: row.voltDcMin, max: row.voltDcMax },
    ctIn: { avg: row.ctInAvg, max: row.ctInMax },
    ctOut: { avg: row.ctOutAvg, max: row.ctOutMax },
    sInVa: { avg: row.sInVaAvg, max: row.sInVaMax },
    sOutVa: { avg: row.sOutVaAvg, max: row.sOutVaMax },
    rssiAvg: row.rssiAvg,
  }));

  return NextResponse.json({ source: "1m", history });
}
