import { timingSafeEqual } from "crypto";

export const authCookieName = "ups_session";
const fallbackSessionToken = "caca538b41cb5f7c05b8b267cf8772bf0422007cdab9fa1cd8222925e05c19dd";

export function authConfig() {
  return {
    password: process.env.UPS_AUTH_PASSWORD || "admin12345",
    sessionToken: process.env.UPS_AUTH_TOKEN || fallbackSessionToken,
    username: process.env.UPS_AUTH_USERNAME || "admin",
  };
}

export function verifyCredentials(username: string, password: string) {
  const config = authConfig();
  const userOk = safeEqual(username, config.username);
  const passwordOk = safeEqual(password, config.password);
  return userOk && passwordOk;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}
