import { NextResponse } from "next/server";
import { authConfig, authCookieName, verifyCredentials, verifySessionToken, getDevFallbackToken, signUserCookie } from "@/lib/auth";
import { USER_COOKIE } from "@/lib/api-auth";
import type { UserRole } from "@/lib/auth";

const VALID_ROLES: UserRole[] = ["viewer", "technician", "admin", "manufacturer"];
const PASSWORD_ROLES = new Set<UserRole>(["admin", "manufacturer"]);

function parseCookie(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

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

  const userPayload = signUserCookie({ username: role === "viewer" ? "operator" : role, role });

  if (!PASSWORD_ROLES.has(role)) {
    // Viewer / Technician — no password, but requires an already-authenticated session.
    // These roles are available as a step-down switch after Admin login, not as
    // a standalone entry point for unauthenticated browsers.
    const cookieHeader = request.headers.get("cookie") ?? "";
    const sessionToken = parseCookie(cookieHeader, authCookieName);
    if (!sessionToken || !verifySessionToken(sessionToken)) {
      return NextResponse.json(
        { error: "Login as Admin first, then switch to this role" },
        { status: 401 },
      );
    }
    // Session verified — just update the role cookie
    const res = NextResponse.json({ ok: true, role });
    res.cookies.set(USER_COOKIE, userPayload, { ...cookieOpts, httpOnly: false });
    return res;
  }

  // Admin / Manufacturer — verify password.
  // These roles establish a new session from scratch; no prior session required.
  const password = body.password ?? "";
  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const username = role === "manufacturer" ? (process.env.UMS_MANUFACTURER_USERNAME ?? "manufacturer") : "admin";
  const result = await verifyCredentials(username, password);
  // Also accept "admin" credentials for manufacturer when no separate manufacturer user exists
  const verified =
    result.ok ||
    (role === "manufacturer" && (await verifyCredentials("admin", password)).ok);

  if (!verified) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const authCfg = authConfig();
  const newSessionToken =
    authCfg.sessionToken ??
    (authCfg.allowDevAuth && process.env.NODE_ENV !== "production" ? getDevFallbackToken() : null);

  if (!newSessionToken) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(authCookieName, newSessionToken, cookieOpts);
  res.cookies.set(USER_COOKIE, userPayload, { ...cookieOpts, httpOnly: false });
  return res;
}
