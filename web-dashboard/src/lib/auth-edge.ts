// Edge-runtime-safe auth functions — no Node.js-only imports.
// Used by middleware.ts which runs in the Next.js Edge Runtime.

export const authCookieName = "ups_session";

const DEV_FALLBACK_TOKEN = "dev-allow-auth-not-for-production";

export function verifySessionToken(token: string): boolean {
  const sessionToken = process.env.UPS_AUTH_TOKEN;
  const isProduction = process.env.NODE_ENV === "production";
  const allowDevAuth = process.env.ALLOW_DEV_AUTH === "true";

  if (sessionToken) {
    return safeEqual(token, sessionToken);
  }

  if (!isProduction && allowDevAuth) {
    return token === DEV_FALLBACK_TOKEN;
  }

  return false;
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
