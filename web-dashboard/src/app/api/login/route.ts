import { NextResponse } from "next/server";

import { authConfig, authCookieName, verifyCredentials, getDevFallbackToken, signUserCookie } from "@/lib/auth";
import { USER_COOKIE } from "@/lib/api-auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") || "");
  const password = String(form.get("password") || "");
  const next = String(form.get("next") || "/");

  const result = await verifyCredentials(username, password);
  if (!result.ok) {
    return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(next)}`, request.url), {
      status: 303,
    });
  }

  const config = authConfig();
  const sessionToken = config.sessionToken ?? (config.allowDevAuth && process.env.NODE_ENV !== "production" ? getDevFallbackToken() : null);
  if (!sessionToken) {
    return NextResponse.redirect(new URL("/login?error=notoken", request.url), { status: 303 });
  }

  const response = NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", request.url), {
    status: 303,
  });

  const cookieOpts = {
    httpOnly: true,
    maxAge: 60 * 60 * 12,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };

  response.cookies.set(authCookieName, sessionToken, cookieOpts);
  response.cookies.set(USER_COOKIE, signUserCookie({ username: result.username, role: result.role }), {
    ...cookieOpts,
    httpOnly: false, // readable by client JS for display
  });

  return response;
}
