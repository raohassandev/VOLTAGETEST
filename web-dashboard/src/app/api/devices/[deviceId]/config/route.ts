/**
 * Push configuration to a connected board via MQTT.
 * The board must be subscribed to ums/devices/{deviceId}/config.
 *
 * TODO: track pending config acks via ums/devices/{deviceId}/config/ack
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { getBroker } from "@/lib/broker";

interface ConfigPayload {
  reportingIntervalMs?: number;
  calibration?: {
    vInScale?: number;  vInOffset?: number;
    vOutScale?: number; vOutOffset?: number;
    vDcScale?: number;  vDcOffset?: number;
    iInScale?: number;  iInOffset?: number;
    iOutScale?: number; iOutOffset?: number;
  };
  brokerUrl?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;

  const { deviceId } = await params;
  const body = (await request.json()) as ConfigPayload;

  try {
    const broker = getBroker();
    const topic   = `ums/devices/${deviceId}/config`;
    const payload = Buffer.from(JSON.stringify({ ...body, ts: Date.now() }));

    await new Promise<void>((resolve, reject) => {
      broker.publish(
        { cmd: "publish", qos: 1, topic, payload, retain: false, dup: false },
        (err?: Error) => (err ? reject(err) : resolve()),
      );
    });

    return NextResponse.json({ ok: true, topic });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to publish config — board may not be connected", detail: String(err) },
      { status: 503 },
    );
  }
}
