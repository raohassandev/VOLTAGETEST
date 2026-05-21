import { NextResponse, type NextRequest } from "next/server";

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

export function proxy(request: NextRequest) {
  const sessionToken = request.cookies.get("ups_session")?.value;
  const configuredToken = process.env.UPS_AUTH_TOKEN;
  const allowDevAuth = process.env.ALLOW_DEV_AUTH === "true";
  const isProduction = process.env.NODE_ENV === "production";
  const DEV_FALLBACK_TOKEN = "dev-allow-auth-not-for-production";

  const isValid =
    sessionToken &&
    (configuredToken
      ? safeEqual(sessionToken, configuredToken)
      : !isProduction && allowDevAuth && sessionToken === DEV_FALLBACK_TOKEN);

  if (isValid) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!login|api|_next|favicon.ico).*)"],
};
