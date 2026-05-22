/**
 * Embedded MQTT broker — Aedes running inside the Next.js process.
 * Boards connect on port 1883 (TCP) over the local LAN.
 * WebSocket clients can connect on port 1884 (future: tablet/browser boards).
 *
 * Exported singleton is used by the telemetry worker to subscribe to messages
 * without a second TCP hop.
 */

import { Aedes, type Client, type AedesPublishPacket } from "aedes";
import { createServer } from "net";
import { createServer as createHttpServer } from "http";
import { WebSocketServer } from "ws";
import { networkInterfaces } from "os";
import { getEventBus } from "./event-bus";

// TODO: add aedes-persistence-mongodb or aedes-persistence-level for QoS1 guarantee across restarts
// TODO: add per-client authentication (username/password) configurable from SystemSettings

const MQTT_PORT = Number(process.env.MQTT_PORT ?? 1883);
const MQTT_WS_PORT = Number(process.env.MQTT_WS_PORT ?? 1884);

let brokerInstance: Aedes | null = null;

function getLanIp(): string {
  const ifaces = networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface ?? []) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return "127.0.0.1";
}

export function getBroker(): Aedes {
  if (!brokerInstance) throw new Error("Broker not started yet");
  return brokerInstance;
}

export async function startBroker(): Promise<Aedes> {
  if (brokerInstance) return brokerInstance;

  const bus = getEventBus();
  const aedes = new Aedes();
  brokerInstance = aedes;

  // ── TCP server (boards connect here) ─────────────────────────────────────
  const tcpServer = createServer(aedes.handle);
  await new Promise<void>((resolve, reject) => {
    tcpServer.listen(MQTT_PORT, "0.0.0.0", () => resolve());
    tcpServer.on("error", reject);
  });

  // ── WebSocket server (browser / tablet boards) ────────────────────────────
  const httpServer = createHttpServer();
  const wss = new WebSocketServer({ server: httpServer });
  wss.on("connection", (ws, req) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    aedes.handle(ws as any, req);
  });
  await new Promise<void>((resolve, reject) => {
    httpServer.listen(MQTT_WS_PORT, "0.0.0.0", () => resolve());
    httpServer.on("error", (err) => {
      // WS port failure is non-fatal — log and continue
      console.warn(`[broker] WS server failed to start on port ${MQTT_WS_PORT}:`, err.message);
      resolve();
    });
  });

  const lanIp = getLanIp();
  console.log(`[broker] MQTT broker listening on ${lanIp}:${MQTT_PORT} (TCP) and :${MQTT_WS_PORT} (WS)`);
  console.log(`[broker] Boards should connect to mqtt://${lanIp}:${MQTT_PORT} or ums-server.local:${MQTT_PORT}`);

  // ── Client lifecycle events → EventBus ───────────────────────────────────
  aedes.on("client", (client: Client) => {
    console.log(`[broker] Board connected: ${client.id}`);
    bus.emit("device-online", { clientId: client.id });
  });

  aedes.on("clientDisconnect", (client: Client) => {
    console.log(`[broker] Board disconnected: ${client.id}`);
    bus.emit("device-offline", { clientId: client.id });
  });

  aedes.on("clientError", (client: Client, err: Error) => {
    console.warn(`[broker] Client error ${client.id}: ${err.message}`);
  });

  aedes.on("publish", (packet: AedesPublishPacket, client: Client | null) => {
    if (!client) return;
    if (packet.topic.startsWith("$SYS")) return;
    bus.emit("mqtt-message", { topic: packet.topic, payload: packet.payload });
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = () => {
    aedes.close(() => {
      tcpServer.close();
      httpServer.close();
      console.log("[broker] Shut down.");
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  return aedes;
}
