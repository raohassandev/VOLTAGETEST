import { NextResponse } from "next/server";
import { authConfig, authCookieName, verifyCredentials, getDevFallbackToken } from "@/lib/auth";
import { USER_COOKIE } from "@/lib/api-auth";
import type { UserRole } from "@/lib/auth";

const VALID_ROLES: UserRole[] = ["viewer", "technician", "admin", "manufacturer"];
const PASSWORD_ROLES = new Set<UserRole>(["admin", "manufacturer"]);

export async function POST(request: Request) {
  const body = (await request.json()) as { role?: string; password?: string };
  const role = body.role as UserRole | undefined;

  if (!role || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const cookieOpts = {
    httpOnly: true,
    maxAge: 60 * 60 * 24,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };

  const userPayload = btoa(JSON.stringify({ username: role === "viewer" ? "operator" : role, role }));

  if (!PASSWORD_ROLES.has(role)) {
    // Viewer / Technician — no password needed, just set role cookie
    const res = NextResponse.json({ ok: true, role });
    res.cookies.set(USER_COOKIE, userPayload, { ...cookieOpts, httpOnly: false });
    return res;
  }

  // Admin / Manufacturer — verify password
  const password = body.password ?? "";
  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  // The admin username for env-var auth is always "admin"; manufacturer uses same credential
  const username = role === "manufacturer" ? (process.env.UMS_MANUFACTURER_USERNAME ?? "manufacturer") : "admin";
  const result = await verifyCredentials(username, password);

  // Also try "admin" credentials for manufacturer if no separate manufacturer user exists
  const verified =
    result.ok ||
    (role === "manufacturer" && (await verifyCredentials("admin", password)).ok);

  if (!verified) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const config = authConfig();
  const sessionToken =
    config.sessionToken ??
    (config.allowDevAuth && process.env.NODE_ENV !== "production" ? getDevFallbackToken() : null);

  if (!sessionToken) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(authCookieName, sessionToken, cookieOpts);
  res.cookies.set(USER_COOKIE, userPayload, { ...cookieOpts, httpOnly: false });
  return res;
}
