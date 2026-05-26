import { NextResponse } from "next/server";
import { authCookieName, verifySessionToken, verifyUserCookie } from "@/lib/auth";
import type { UserRole } from "@/lib/auth";

export const USER_COOKIE = "ups_user";

export interface SessionUser {
  username: string;
  role: UserRole;
}

// Rank used for minimum-role checks
const ROLE_RANK: Record<UserRole, number> = {
  viewer: 0,
  technician: 1,
  admin: 2,
  manufacturer: 3,
};

export function getSessionUser(request: Request): SessionUser | null {
  const cookieHeader = request.headers.get("cookie") ?? "";

  // Always verify ups_session FIRST. ups_user is not httpOnly and can be forged.
  // A valid session is required for any API access, regardless of role.
  const sessionToken = parseCookie(cookieHeader, authCookieName);
  if (!sessionToken || !verifySessionToken(sessionToken)) {
    return null;
  }

  // Session is valid — verify HMAC-signed ups_user cookie for role.
  // ups_user is not httpOnly (browser reads it for display) but its HMAC
  // prevents role forgery by a lower-privilege authenticated user.
  const userCookie = parseCookie(cookieHeader, USER_COOKIE);
  if (userCookie) {
    const verified = verifyUserCookie(userCookie);
    if (verified) return verified;
    // Cookie present but HMAC invalid — deny rather than fall through
    return null;
  }

  // Valid session but no ups_user → treat as viewer (safest default)
  return { username: "unknown", role: "viewer" };
}

export function requireApiAuth(
  request: Request,
): { ok: true; user: SessionUser } | { ok: false; response: NextResponse } {
  const user = getSessionUser(request);
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true, user };
}

export function requireRole(
  request: Request,
  minRole: UserRole,
): { ok: true; user: SessionUser } | { ok: false; response: NextResponse } {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth;

  if ((ROLE_RANK[auth.user.role] ?? 0) < (ROLE_RANK[minRole] ?? 0)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return auth;
}

function parseCookie(header: string, name: string): string | null {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
