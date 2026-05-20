import { NextResponse, type NextRequest } from "next/server";

import { verifySessionToken } from "@/lib/auth";

export function middleware(request: NextRequest) {
  const sessionToken = request.cookies.get("ups_session")?.value;

  if (sessionToken && verifySessionToken(sessionToken)) {
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
