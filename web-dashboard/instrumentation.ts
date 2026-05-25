/**
 * Next.js instrumentation - runs once on server startup in the Node.js runtime.
 * It validates production secrets and starts background services used in dev.
 */

import { PrismaClient } from "@prisma/client";

const PLACEHOLDER_VALUES = new Set([
  "replace-with-a-long-random-session-token",
  "replace-with-a-64-char-hex-string-generated-by-crypto-randomBytes",
  "replace-with-64-char-hex",
  "REPLACE_WITH_64_CHAR_HEX_FROM_crypto_randomBytes_32",
  "change-this-db-password",
  "change-this-strong-random-password",
  "CHANGE_THIS_DB_PASSWORD",
  "change-this-mqtt-password",
  "change-this-strong-mqtt-password",
  "CHANGE_THIS_MQTT_PASSWORD",
  "replacethiswithyourrealbcrypthash",
  "REPLACE_THIS_WITH_YOUR_REAL_BCRYPT_HASH",
]);

const SECRET_ENV_NAMES = [
  "DATABASE_URL",
  "POSTGRES_PASSWORD",
  "UPS_AUTH_TOKEN",
  "UPS_AUTH_PASSWORD",
  "UPS_AUTH_PASSWORD_HASH",
  "MQTT_PASSWORD",
];

function validateStartupSecrets() {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    for (const name of SECRET_ENV_NAMES) {
      const value = process.env[name];
      if (value && PLACEHOLDER_VALUES.has(value)) {
        throw new Error(`[startup] FATAL: ${name} is still set to a placeholder value.`);
      }
    }
    if (!process.env.UPS_AUTH_TOKEN) {
      throw new Error("[auth] FATAL: UPS_AUTH_TOKEN must be set in production.");
    }
    if (!process.env.UPS_AUTH_PASSWORD_HASH) {
      throw new Error("[auth] FATAL: UPS_AUTH_PASSWORD_HASH must be set in production.");
    }
    if (process.env.UPS_AUTH_PASSWORD) {
      throw new Error("[auth] FATAL: plaintext UPS_AUTH_PASSWORD is not allowed in production.");
    }
    if (!process.env.DATABASE_URL) {
      throw new Error("[startup] FATAL: DATABASE_URL must be set in production.");
    }
    if (process.env.MQTT_USERNAME && !process.env.MQTT_PASSWORD) {
      throw new Error("[startup] FATAL: MQTT_PASSWORD must be set when MQTT_USERNAME is set.");
    }
    return;
  }

  if (!process.env.UPS_AUTH_TOKEN && process.env.ALLOW_DEV_AUTH !== "true") {
    console.warn("[auth] No UPS_AUTH_TOKEN and ALLOW_DEV_AUTH not set - login will fail.");
  }
  if (process.env.ALLOW_DEV_AUTH === "true") {
    console.warn("[auth] ALLOW_DEV_AUTH=true - dev auth bypass active. Do not use in production.");
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  validateStartupSecrets();

  if (!process.env.DATABASE_URL) {
    console.warn("[startup] DATABASE_URL not set - background services disabled.");
    return;
  }

  const embeddedBrokerEnabled = process.env.ENABLE_EMBEDDED_BROKER !== "false";

  if (embeddedBrokerEnabled) {
    try {
      const { startBroker } = await import("./src/lib/broker");
      await startBroker();
    } catch (err) {
      console.error("[startup] Failed to start MQTT broker:", err instanceof Error ? err.message : err);
    }
  } else {
    console.log("[startup] Embedded MQTT broker disabled (ENABLE_EMBEDDED_BROKER=false).");
  }

  try {
    const { startMdns } = await import("./src/lib/mdns");
    startMdns();
  } catch (err) {
    console.warn("[startup] mDNS advertisement failed (non-fatal):", err instanceof Error ? err.message : err);
  }

  if (embeddedBrokerEnabled) {
    setTimeout(async () => {
      try {
        const { startTelemetryWorker } = await import("./src/lib/telemetry-worker");
        await startTelemetryWorker();
      } catch (err) {
        console.error("[startup] Failed to start telemetry worker:", err instanceof Error ? err.message : err);
      }
    }, 500);
  } else {
    console.log("[startup] In-process telemetry worker disabled (ENABLE_EMBEDDED_BROKER=false).");
  }

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
