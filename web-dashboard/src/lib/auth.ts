import bcrypt from "bcryptjs";

export const authCookieName = "ups_session";

export function authConfig() {
  return {
    username: process.env.UPS_AUTH_USERNAME || "admin",
    password: process.env.UPS_AUTH_PASSWORD,
    passwordHash: process.env.UPS_AUTH_PASSWORD_HASH,
    sessionToken: process.env.UPS_AUTH_TOKEN,
  };
}

export function isAuthConfigured(): boolean {
  const { password, passwordHash, sessionToken } = authConfig();
  return Boolean((password || passwordHash) && sessionToken);
}

export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  const config = authConfig();

  if (process.env.NODE_ENV === "production" && !isAuthConfigured()) {
    console.error("[auth] Production login blocked: UPS_AUTH_TOKEN and a password must be set.");
    return false;
  }

  const expectedUsername = config.username;
  if (!safeEqual(username, expectedUsername)) return false;

  if (config.passwordHash) {
    return bcrypt.compare(password, config.passwordHash);
  }

  if (config.password) {
    return safeEqual(password, config.password);
  }

  return false;
}

export function verifySessionToken(token: string): boolean {
  const config = authConfig();

  if (!config.sessionToken) {
    if (process.env.NODE_ENV !== "production") {
      return token === "caca538b41cb5f7c05b8b267cf8772bf0422007cdab9fa1cd8222925e05c19dd";
    }
    return false;
  }

  return safeEqual(token, config.sessionToken);
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
