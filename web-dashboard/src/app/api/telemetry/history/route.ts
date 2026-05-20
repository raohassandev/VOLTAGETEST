import { NextResponse } from "next/server";

import { getTelemetryStore } from "@/lib/mqtt-ingestion";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("device_id");
  const store = await getTelemetryStore();

  if (deviceId) {
    return NextResponse.json({ history: store.history[deviceId] || [] });
  }

  return NextResponse.json({ history: store.history });
}

