/**
 * Next.js instrumentation — runs once on server startup (Node.js runtime only).
 * Starts all background services: MQTT broker, telemetry worker, mDNS, LAN scanner.
 *
 * Order:
 *   1. Validate environment / secrets
 *   2. Start embedded Aedes MQTT broker (port 1883)
 *   3. Start mDNS advertisement (ums-server.local)
 *   4. Start telemetry worker (subscribes to broker, writes to DB)
 *   5. Start LAN scanner (finds boards not yet connected via MQTT)
 */

import { PrismaClient } from "@prisma/client";

const PLACEHOLDER_SECRETS: [string, string][] = [
  ["UPS_AUTH_TOKEN",    "replace-with-a-long-random-session-token"],
  ["POSTGRES_PASSWORD", "change-this-db-password"],
  ["MQTT_PASSWORD",     "change-this-mqtt-password"],
];

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const isProduction = process.env.NODE_ENV === "production";

  // ── Secret validation ───────────────────────────────────────────────────────
  if (isProduction) {
    for (const [name, placeholder] of PLACEHOLDER_SECRETS) {
      if (process.env[name] === placeholder) {
        throw new Error(
          `[startup] FATAL: ${name} is still set to the placeholder "${placeholder}". ` +
          `Replace it with a real secret before running in production.`,
        );
      }
    }
    if (!process.env.UPS_AUTH_TOKEN) {
      console.error("[auth] FATAL: UPS_AUTH_TOKEN not set — login blocked in production.");
    }
    if (!process.env.UPS_AUTH_PASSWORD_HASH && !process.env.UPS_AUTH_PASSWORD) {
      console.error("[auth] FATAL: No password configured — login blocked in production.");
    }
  } else {
    if (!process.env.UPS_AUTH_TOKEN && process.env.ALLOW_DEV_AUTH !== "true") {
      console.warn("[auth] No UPS_AUTH_TOKEN and ALLOW_DEV_AUTH not set — login will fail.");
    }
    if (process.env.ALLOW_DEV_AUTH === "true") {
      console.warn("[auth] ALLOW_DEV_AUTH=true — dev auth bypass active. Do not use in production.");
    }
  }

  // ── Skip background services if DB is not configured ───────────────────────
  if (!process.env.DATABASE_URL) {
    console.warn("[startup] DATABASE_URL not set — background services disabled.");
    return;
  }

  // ── Phase 2: Start embedded MQTT broker ────────────────────────────────────
  try {
    const { startBroker } = await import("./src/lib/broker");
    await startBroker();
  } catch (err) {
    console.error("[startup] Failed to start MQTT broker:", err instanceof Error ? err.message : err);
    // NOTE: broker failure is non-fatal in dev but boards won't connect
  }

  // ── Phase 4: Start mDNS advertisement ──────────────────────────────────────
  try {
    const { startMdns } = await import("./src/lib/mdns");
    startMdns();
  } catch (err) {
    console.warn("[startup] mDNS advertisement failed (non-fatal):", err instanceof Error ? err.message : err);
  }

  // ── Phase 3: Start telemetry worker ────────────────────────────────────────
  // Small delay so broker TCP server is fully bound before worker connects
  setTimeout(async () => {
    try {
      const { startTelemetryWorker } = await import("./src/lib/telemetry-worker");
      await startTelemetryWorker();
    } catch (err) {
      console.error("[startup] Failed to start telemetry worker:", err instanceof Error ? err.message : err);
    }
  }, 500);

  // ── Phase 5: Start LAN scanner ─────────────────────────────────────────────
  setTimeout(async () => {
    try {
      const { startLanScanner } = await import("./src/lib/lan-scanner");
      const prisma = new PrismaClient({ log: ["warn", "error"] });
      startLanScanner(prisma);
    } catch (err) {
      console.warn("[startup] LAN scanner failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  }, 2_000);
}
