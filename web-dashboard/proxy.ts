import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "ups_session";

// Edge-runtime-safe session check (no bcrypt, no prisma).
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
  matcher: ["/((?!welcome|api|_next|favicon.ico|brand).*)"],
};
