/**
 * Send a command to a connected board via MQTT.
 * Commands: reboot | reset-energy | ota
 *
 * In embedded-broker mode (dev/local), publishes through the in-process Aedes instance.
 * In external-broker mode (Docker/production), connects to MQTT_BROKER_URL directly.
 */

import { NextResponse } from "next/server";
import mqtt from "mqtt";
import { requireRole } from "@/lib/api-auth";
import { getBroker } from "@/lib/broker";
import { prisma, isDbEnabled } from "@/lib/db";
import { requireFeature } from "@/lib/license/enforce";

type Command = "reboot" | "reset-energy" | "ota";

interface CommandPayload {
  cmd: Command;
  url?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const auth = requireRole(request, "manufacturer");
  if (!auth.ok) return auth.response;

  const { deviceId } = await params;
  const body = (await request.json()) as CommandPayload;

  if (!["reboot", "reset-energy", "ota"].includes(body.cmd)) {
    return NextResponse.json({ error: "Invalid command" }, { status: 400 });
  }
  if (body.cmd === "ota" && isDbEnabled()) {
    const licenseBlock = await requireFeature(prisma, "ota");
    if (licenseBlock) return licenseBlock;
  }

  const topic   = `ums/devices/${deviceId}/command`;
  const message = JSON.stringify({ ...body, ts: Date.now() });

  try {
    if (process.env.ENABLE_EMBEDDED_BROKER !== "false") {
      // Local/dev: publish through in-process Aedes broker
      const broker  = getBroker();
      const payload = Buffer.from(message);
      await new Promise<void>((resolve, reject) => {
        broker.publish(
          { cmd: "publish", qos: 1, topic, payload, retain: false, dup: false },
          (err?: Error) => (err ? reject(err) : resolve()),
        );
      });
    } else {
      // Docker/production: connect to external Mosquitto
      const brokerUrl = process.env.MQTT_BROKER_URL;
      if (!brokerUrl) {
        return NextResponse.json({ error: "MQTT_BROKER_URL not configured" }, { status: 503 });
      }
      await new Promise<void>((resolve, reject) => {
        const client = mqtt.connect(brokerUrl, {
          username: process.env.MQTT_USERNAME,
          password: process.env.MQTT_PASSWORD,
          connectTimeout: 5_000,
          clientId: `ums-cmd-${Math.random().toString(16).slice(2, 10)}`,
        });
        client.once("connect", () => {
          client.publish(topic, message, { qos: 1 }, (err) => {
            client.end();
            if (err) reject(err); else resolve();
          });
        });
        client.once("error", (err) => { client.end(); reject(err); });
      });
    }

    return NextResponse.json({ ok: true, topic, cmd: body.cmd });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to publish command — board may not be connected", detail: String(err) },
      { status: 503 },
    );
  }
}
