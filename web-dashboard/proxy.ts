import { NextResponse, type NextRequest } from "next/server";

const USER_COOKIE = "ups_user";

function hasValidUserCookie(request: NextRequest): boolean {
  const raw = request.cookies.get(USER_COOKIE)?.value;
  if (!raw) return false;
  try {
    const parsed = JSON.parse(atob(raw)) as { role?: string };
    return !!parsed.role;
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  if (hasValidUserCookie(request)) return NextResponse.next();

  const welcomeUrl = request.nextUrl.clone();
  welcomeUrl.pathname = "/welcome";
  welcomeUrl.search = "";
  return NextResponse.redirect(welcomeUrl);
}

export const config = {
  matcher: ["/((?!welcome|api|_next|favicon.ico|brand).*)"],
};
