/**
 * Send a command to a connected board via MQTT.
 * Commands: reboot | reset-energy | ota
 *
 * TODO: OTA requires a firmware binary URL — defer until Phase R (remote).
 */

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { getBroker } from "@/lib/broker";

type Command = "reboot" | "reset-energy" | "ota";

interface CommandPayload {
  cmd: Command;
  url?: string; // OTA firmware URL
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;

  const { deviceId } = await params;
  const body = (await request.json()) as CommandPayload;

  if (!["reboot", "reset-energy", "ota"].includes(body.cmd)) {
    return NextResponse.json({ error: "Invalid command" }, { status: 400 });
  }

  try {
    const broker  = getBroker();
    const topic   = `ums/devices/${deviceId}/command`;
    const payload = Buffer.from(JSON.stringify({ ...body, ts: Date.now() }));

    await new Promise<void>((resolve, reject) => {
      broker.publish(
        { cmd: "publish", qos: 1, topic, payload, retain: false, dup: false },
        (err?: Error) => (err ? reject(err) : resolve()),
      );
    });

    return NextResponse.json({ ok: true, topic, cmd: body.cmd });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to publish command — board may not be connected", detail: String(err) },
      { status: 503 },
    );
  }
}
