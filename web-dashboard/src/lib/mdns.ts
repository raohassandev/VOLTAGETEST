/**
 * mDNS advertisement — broadcasts service records on the local LAN so
 * ESP32 boards can resolve "ums-server.local" without a hardcoded IP.
 *
 * Advertises:
 *   _mqtt._tcp  port 1883  → MQTT broker  (boards connect here)
 *   _http._tcp  port 3303  → Dashboard    (browser discovery)
 *
 * TODO: handle Windows Firewall blocking mDNS multicast (UDP port 5353).
 *       The installer must open this port. Add a startup warning if mDNS fails.
 */

import { Bonjour } from "bonjour-service";
import { networkInterfaces } from "os";

let bonjourInstance: InstanceType<typeof Bonjour> | null = null;

export function startMdns(): void {
  try {
    bonjourInstance = new Bonjour();

    const mqttPort = Number(process.env.MQTT_PORT ?? 1883);
    const httpPort = Number(process.env.PORT ?? 3303);

    bonjourInstance.publish({
      name: "ums-server",
      type: "mqtt",
      port: mqttPort,
      txt:  { version: "1.0", product: "UMS" },
    });

    bonjourInstance.publish({
      name: "ums-dashboard",
      type: "http",
      port: httpPort,
      txt:  { version: "1.0", path: "/" },
    });

    const lanIp = getLanIp();
    console.log(`[mdns] Advertising ums-server.local → ${lanIp}:${mqttPort} (MQTT) and :${httpPort} (HTTP)`);
    console.log(`[mdns] Boards can use "ums-server.local" as broker hostname`);
  } catch (err) {
    // NOTE: mDNS failure is non-fatal — boards can still use IP address directly
    console.warn("[mdns] Failed to start mDNS advertisement:", err instanceof Error ? err.message : err);
  }

  process.once("SIGINT",  stopMdns);
  process.once("SIGTERM", stopMdns);
}

export function stopMdns(): void {
  if (bonjourInstance) {
    bonjourInstance.unpublishAll(() => bonjourInstance?.destroy());
    bonjourInstance = null;
  }
}

function getLanIp(): string {
  const ifaces = networkInterfaces();
  const candidates: string[] = [];
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface ?? []) {
      if (addr.family === "IPv4" && !addr.internal) candidates.push(addr.address);
    }
  }
  // Prefer 192.168.x.x or 10.x.x.x over Docker/WSL bridge addresses (172.x.x.x)
  return candidates.find((ip) => ip.startsWith("192.168.") || ip.startsWith("10."))
    ?? candidates[0]
    ?? "127.0.0.1";
}
