import bcrypt from "bcryptjs";
import { prisma, isDbEnabled } from "@/lib/db";

export const authCookieName = "ups_session";
export type UserRole = "admin" | "technician" | "viewer" | "manufacturer";

// Token used when ALLOW_DEV_AUTH=true and no UPS_AUTH_TOKEN is configured.
// This value is intentionally public — it only works when the env var explicitly opts in.
const DEV_FALLBACK_TOKEN = "dev-allow-auth-not-for-production";

export function authConfig() {
  return {
    username: process.env.UPS_AUTH_USERNAME || "admin",
    password: process.env.UPS_AUTH_PASSWORD,
    passwordHash: process.env.UPS_AUTH_PASSWORD_HASH,
    sessionToken: process.env.UPS_AUTH_TOKEN,
    allowDevAuth: process.env.ALLOW_DEV_AUTH === "true",
  };
}

export function isAuthConfigured(): boolean {
  const { password, passwordHash, sessionToken } = authConfig();
  return Boolean((password || passwordHash) && sessionToken);
}

export function isProductionSafe(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const { passwordHash, sessionToken } = authConfig();
  return Boolean(passwordHash && sessionToken);
}

export interface VerifyResult {
  ok: boolean;
  username: string;
  role: UserRole;
}

export async function verifyCredentials(username: string, password: string): Promise<VerifyResult> {
  const fail: VerifyResult = { ok: false, username, role: "viewer" };

  // Check DB users first (multi-user support)
  if (isDbEnabled()) {
    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (user && user.active) {
        const match = await bcrypt.compare(password, user.passwordHash);
        if (match) return { ok: true, username: user.username, role: (user.role as UserRole) ?? "viewer" };
        return fail;
      }
    } catch {
      // DB unavailable — fall through to env-var auth
    }
  }

  // Env-var auth fallback (single admin account)
  const config = authConfig();
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && !isAuthConfigured()) {
    console.error("[auth] Production login blocked: UPS_AUTH_TOKEN and a password/hash must be set.");
    return fail;
  }

  if (!safeEqual(username, config.username)) return fail;

  if (config.passwordHash) {
    const ok = await bcrypt.compare(password, config.passwordHash);
    return { ok, username: config.username, role: "admin" };
  }

  if (config.password) {
    if (isProduction) {
      console.error("[auth] Production: plain-text UPS_AUTH_PASSWORD is set — use UPS_AUTH_PASSWORD_HASH instead.");
    }
    return { ok: safeEqual(password, config.password), username: config.username, role: "admin" };
  }

  if (!isProduction && config.allowDevAuth) {
    console.warn("[auth] ALLOW_DEV_AUTH=true — accepting any credentials. Do not use in production.");
    return { ok: true, username: "admin", role: "admin" };
  }

  return fail;
}

export function verifySessionToken(token: string): boolean {
  const config = authConfig();
  const isProduction = process.env.NODE_ENV === "production";

  if (config.sessionToken) {
    return safeEqual(token, config.sessionToken);
  }

  // Dev fallback: accept DEV_FALLBACK_TOKEN when explicitly opted in via ALLOW_DEV_AUTH=true
  if (!isProduction && config.allowDevAuth) {
    return token === DEV_FALLBACK_TOKEN;
  }

  return false;
}

export function getDevFallbackToken(): string {
  return DEV_FALLBACK_TOKEN;
}

function safeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  const ap = a.padEnd(maxLen, "\0");
  const bp = b.padEnd(maxLen, "\0");
  let result = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    result |= ap.charCodeAt(i) ^ bp.charCodeAt(i);
  }
  return result === 0;
}
