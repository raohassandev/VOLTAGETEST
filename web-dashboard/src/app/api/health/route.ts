import { NextResponse } from "next/server";
import net from "net";

import { prisma, isDbEnabled } from "@/lib/db";

/** TCP-level check: can we reach the MQTT broker host:port? */
function checkMqttReachable(brokerUrl: string | undefined): Promise<boolean> {
  if (!brokerUrl) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const url = new URL(brokerUrl);
      const host = url.hostname;
      const port = Number(url.port) || 1883;
      const socket = net.createConnection({ host, port });
      const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 2000);
      socket.once("connect", () => { clearTimeout(timer); socket.destroy(); resolve(true); });
      socket.once("error", () => { clearTimeout(timer); resolve(false); });
    } catch {
      resolve(false);
    }
  });
}

export async function GET() {
  const status: Record<string, unknown> = {
    status: "ok",
    uptime: Math.round(process.uptime()),
    dbEnabled: isDbEnabled(),
  };

  if (isDbEnabled()) {
    // DB connectivity
    try {
      await prisma.$queryRaw`SELECT 1`;
      status.db = "connected";
    } catch {
      status.db = "error";
      status.status = "degraded";
    }

    // Last telemetry ingest time (most recent TelemetryLatest row)
    try {
      const latest = await prisma.telemetryLatest.findFirst({
        orderBy: { receivedAt: "desc" },
        select: { receivedAt: true, deviceId: true },
      });
      if (latest) {
        status.lastTelemetryAt = latest.receivedAt.toISOString();
        status.lastTelemetryDevice = latest.deviceId;
        const ageSecs = Math.round((Date.now() - latest.receivedAt.getTime()) / 1000);
        status.lastTelemetryAgeSecs = ageSecs;
      } else {
        status.lastTelemetryAt = null;
      }
    } catch {
      status.lastTelemetryAt = "error";
    }

    // Worker heartbeat via SystemSettings
    try {
      const settings = await prisma.systemSettings.findUnique({
        where: { id: "default" },
        select: { updatedAt: true },
      });
      status.settingsLastUpdated = settings?.updatedAt?.toISOString() ?? null;
    } catch {
      // non-critical
    }
  }

  // MQTT broker TCP reachability
  const mqttUrl = process.env.MQTT_BROKER_URL;
  status.mqttBrokerUrl = mqttUrl ? mqttUrl.replace(/:[^:@]+@/, ":***@") : null;
  const mqttOk = await checkMqttReachable(mqttUrl);
  status.mqttBrokerReachable = mqttOk;
  if (!mqttOk && process.env.ENABLE_EMBEDDED_BROKER !== "false") {
    // In embedded-broker mode, MQTT is in-process — not a TCP target
    status.mqttBrokerReachable = "embedded";
  }

  const code = status.status === "ok" ? 200 : 503;
  return NextResponse.json(status, { status: code });
}
