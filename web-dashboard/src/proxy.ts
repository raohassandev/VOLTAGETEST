/**
 * Next.js 16 Proxy (formerly middleware.ts).
 * Runs in Node.js runtime before each matched request.
 * Redirects unauthenticated page requests to /welcome.
 */
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "ups_session";

// Node.js-runtime session check (no bcrypt, no prisma needed here).
// Mirrors the logic in src/lib/auth.ts verifySessionToken.
function hasValidSession(request: NextRequest): boolean {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;

  const expected = process.env.UPS_AUTH_TOKEN;
  if (expected) {
    if (token.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < token.length; i++) {
      diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return diff === 0;
  }

  // Dev fallback: ALLOW_DEV_AUTH=true accepts the well-known dev token
  if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_AUTH === "true") {
    return token === "dev-allow-auth-not-for-production";
  }

  return false;
}

export function proxy(request: NextRequest) {
  if (hasValidSession(request)) return NextResponse.next();

  const welcomeUrl = request.nextUrl.clone();
  welcomeUrl.pathname = "/welcome";
  welcomeUrl.search = "";
  return NextResponse.redirect(welcomeUrl);
}

export const config = {
  // Exclude /welcome (role-select landing), /login (direct login form),
  // /api (own auth), static assets and brand images.
  matcher: ["/((?!welcome|login|api|_next|favicon.ico|brand).*)"],
};
