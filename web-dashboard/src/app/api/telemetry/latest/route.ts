import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";

import { prisma, isDbEnabled } from "@/lib/db";
import { getTelemetryStore, recordTelemetry } from "@/lib/mqtt-ingestion";
import { normalizeTelemetry, type RawTelemetry } from "@/lib/telemetry-types";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  if (isDbEnabled()) {
    const rows = await prisma.telemetryLatest.findMany({
      include: { device: { include: { upsUnit: true } } },
    });
    const latest: Record<string, RawTelemetry> = {};
    for (const row of rows) {
      latest[row.deviceId] = {
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
      };
    }
    return NextResponse.json({ latest });
  }

  const store = await getTelemetryStore();
  return NextResponse.json({ latest: store.latest });
}

export async function POST(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const payload = (await request.json()) as Partial<RawTelemetry>;
  const telemetry = normalizeTelemetry(payload, "api/manual");
  await recordTelemetry(telemetry);
  return NextResponse.json({ telemetry });
}
