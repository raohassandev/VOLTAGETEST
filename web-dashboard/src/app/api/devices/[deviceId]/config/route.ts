/**
 * Push configuration to a connected board via MQTT.
 * The board must be subscribed to ums/devices/{deviceId}/config.
 *
 * In Docker / production mode (ENABLE_EMBEDDED_BROKER=false) the embedded
 * broker is not available. This route returns 501 until external MQTT publish
 * is implemented (firmware does not yet subscribe to config topics).
 *
 * TODO: track pending config acks via ums/devices/{deviceId}/config/ack
 * TODO: implement external MQTT publish path for Docker mode
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

  // In production Docker mode the embedded broker is disabled.
  // External MQTT publish is not yet implemented — return 501 until firmware
  // subscribes to config topics and external publish path is added.
  const embeddedEnabled = process.env.ENABLE_EMBEDDED_BROKER === "true";
  if (!embeddedEnabled) {
    return NextResponse.json(
      {
        error: "Config push via MQTT is not available in external-broker mode.",
        detail:
          "ENABLE_EMBEDDED_BROKER=false. Firmware does not yet subscribe to config topics. " +
          "Use the device's local web UI at http://<device-ip>/ to update calibration settings.",
      },
      { status: 501 },
    );
  }

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
