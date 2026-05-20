import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const sessionToken = request.cookies.get("ups_session")?.value;
  const expectedToken = process.env.UPS_AUTH_TOKEN;
  const fallbackToken = process.env.UPS_AUTH_PASSWORD
    ? undefined
    : "caca538b41cb5f7c05b8b267cf8772bf0422007cdab9fa1cd8222925e05c19dd";

  if (sessionToken && (sessionToken === expectedToken || sessionToken === fallbackToken)) {
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
