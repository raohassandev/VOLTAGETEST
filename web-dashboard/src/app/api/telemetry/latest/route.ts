import { NextResponse } from "next/server";

import { getTelemetryStore, recordTelemetry } from "@/lib/mqtt-ingestion";
import { normalizeTelemetry, type RawTelemetry } from "@/lib/telemetry-types";

export async function GET() {
  const store = await getTelemetryStore();
  return NextResponse.json({ latest: store.latest });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<RawTelemetry>;
  const telemetry = normalizeTelemetry(payload, "api/manual");
  await recordTelemetry(telemetry);
  return NextResponse.json({ telemetry });
}

