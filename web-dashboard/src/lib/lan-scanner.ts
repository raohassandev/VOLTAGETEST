/**
 * LAN scanner — discovers ESP32 boards that are on the local network
 * but have not yet connected via MQTT.
 *
 * Strategy:
 *   1. Read the OS ARP table (fast, no packets sent)
 *   2. For each entry, probe port 80 for the UMS board HTTP API (GET /api/info)
 *   3. Upsert DeviceDiscovered rows in the DB
 *   4. Emit "scan-result" on the event bus
 *
 * FIXME: ARP table only contains devices that have recently communicated.
 *        Add optional ICMP ping sweep as a complement in the next iteration.
 * TODO: test Windows 11 ARP output format (may differ from Windows 10).
 */

import { exec } from "child_process";
import { networkInterfaces } from "os";
import { promisify } from "util";
import { PrismaClient } from "@prisma/client";
import { getEventBus } from "./event-bus";

const execAsync = promisify(exec);
const PROBE_TIMEOUT_MS = 2_000;
const SCAN_INTERVAL_MS = 5 * 60 * 1_000; // 5 minutes

let scannerPrisma: PrismaClient | null = null;

// ── ARP table parsing ─────────────────────────────────────────────────────────

interface ArpEntry {
  ip:  string;
  mac: string;
}

async function readArpTable(): Promise<ArpEntry[]> {
  try {
    const { stdout } = await execAsync("arp -a");
    const entries: ArpEntry[] = [];
    const lines = stdout.split("\n");
    for (const line of lines) {
      // Windows:  192.168.0.100         30-76-f5-a5-ad-54     dynamic
      // Linux:    192.168.0.100  ether  30:76:f5:a5:ad:54  C  eth0
      const match = line.match(/(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2}[:\-][0-9a-f]{2})/i);
      if (!match) continue;
      const ip  = match[1];
      const mac = match[2].replace(/-/g, ":").toLowerCase();
      // Skip multicast/broadcast MACs
      if (mac === "ff:ff:ff:ff:ff:ff") continue;
      entries.push({ ip, mac });
    }
    return entries;
  } catch (err) {
    console.warn("[scanner] Failed to read ARP table:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ── Board HTTP probe ──────────────────────────────────────────────────────────

interface BoardInfo {
  device_id?: string;
  firmware?:  string;
  mac?:       string;
  ip?:        string;
  uptime_ms?: number;
  rssi?:      number;
}

async function probeBoard(ip: string): Promise<BoardInfo | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(`http://${ip}/api/info`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json() as BoardInfo;
    // Confirm it's actually a UMS board by checking for device_id
    if (typeof json.device_id !== "string") return null;
    return json;
  } catch {
    return null;
  }
}

// ── Main scan ─────────────────────────────────────────────────────────────────

export async function runLanScan(): Promise<void> {
  const prisma = scannerPrisma;
  if (!prisma) return;

  console.log("[scanner] Starting LAN scan…");
  const arpEntries = await readArpTable();

  if (arpEntries.length === 0) {
    console.log("[scanner] ARP table empty — nothing to probe");
    return;
  }

  const lanIp = getLocalIp();
  const subnet = lanIp.split(".").slice(0, 3).join(".");

  // Only probe IPs on same subnet
  const candidates = arpEntries.filter((e) => e.ip.startsWith(subnet + ".") && e.ip !== lanIp);
  console.log(`[scanner] Probing ${candidates.length} ARP entries on ${subnet}.0/24`);

  const discovered: BoardInfo[] = [];

  await Promise.allSettled(
    candidates.map(async (entry) => {
      const info = await probeBoard(entry.ip);
      const now  = new Date();

      if (info) {
        // Confirmed UMS board
        await prisma.deviceDiscovered.upsert({
          where:  { ip: entry.ip },
          create: {
            ip:             entry.ip,
            mac:            info.mac ?? entry.mac,
            boardConfirmed: true,
            deviceId:       info.device_id ?? null,
            firmware:       info.firmware  ?? null,
            firstSeenAt:    now,
            lastSeenAt:     now,
            rawInfo:        info as object,
          },
          update: {
            mac:            info.mac ?? entry.mac,
            boardConfirmed: true,
            deviceId:       info.device_id ?? null,
            firmware:       info.firmware  ?? null,
            lastSeenAt:     now,
            rawInfo:        info as object,
          },
        });

        // Auto-link to Device row if MAC matches
        if (info.mac ?? entry.mac) {
          const mac = (info.mac ?? entry.mac).toLowerCase();
          const device = await prisma.device.findFirst({ where: { mac } });
          if (device) {
            await prisma.deviceDiscovered.update({
              where: { ip: entry.ip },
              data:  { deviceId: device.deviceId },
            });
          }
        }

        discovered.push(info);
        console.log(`[scanner] Found UMS board at ${entry.ip} — device_id: ${info.device_id}`);
      } else {
        // Seen on LAN but not a UMS board — update lastSeenAt if already tracked
        await prisma.deviceDiscovered.updateMany({
          where: { ip: entry.ip, boardConfirmed: false },
          data:  { lastSeenAt: now },
        }).catch(() => undefined); // ignore if row doesn't exist
      }
    }),
  );

  getEventBus().emit("scan-result", { discovered });
  console.log(`[scanner] Scan complete — ${discovered.length} UMS board(s) found`);
}

function getLocalIp(): string {
  const ifaces = networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    for (const addr of iface ?? []) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return "127.0.0.1";
}

// ── Startup ───────────────────────────────────────────────────────────────────

export function startLanScanner(prisma: PrismaClient): void {
  scannerPrisma = prisma;

  // First scan after 15s (give app time to fully start)
  setTimeout(() => runLanScan().catch(console.error), 15_000);

  // Then every 5 minutes
  setInterval(() => runLanScan().catch(console.error), SCAN_INTERVAL_MS);

  console.log("[scanner] LAN scanner started — first scan in 15s");
}
