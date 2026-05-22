import { NextResponse } from "next/server";
import { authCookieName, verifySessionToken } from "@/lib/auth";
import type { UserRole } from "@/lib/auth";

export const USER_COOKIE = "ups_user";

export interface SessionUser {
  username: string;
  role: UserRole;
}

// Roles that require a verified password session
const PASSWORD_ROLES = new Set<UserRole>(["admin", "manufacturer"]);

// Rank used for minimum-role checks
const ROLE_RANK: Record<UserRole, number> = {
  viewer: 0,
  technician: 1,
  admin: 2,
  manufacturer: 3,
};

export function getSessionUser(request: Request): SessionUser | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const userCookie = parseCookie(cookieHeader, USER_COOKIE);
  if (userCookie) {
    try {
      return JSON.parse(atob(userCookie)) as SessionUser;
    } catch {
      // malformed cookie — fall through
    }
  }
  // Legacy: valid ups_session with no ups_user cookie → treat as admin
  const sessionToken = parseCookie(cookieHeader, authCookieName);
  if (sessionToken && verifySessionToken(sessionToken)) {
    return { username: "admin", role: "admin" };
  }
  return null;
}

export function requireApiAuth(
  request: Request,
): { ok: true; user: SessionUser } | { ok: false; response: NextResponse } {
  const user = getSessionUser(request);
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // Password roles require a valid ups_session token as well
  if (PASSWORD_ROLES.has(user.role)) {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const sessionToken = parseCookie(cookieHeader, authCookieName);
    if (!sessionToken || !verifySessionToken(sessionToken)) {
      return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
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
