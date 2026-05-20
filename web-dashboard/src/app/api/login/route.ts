import { NextResponse } from "next/server";

import { authConfig, authCookieName, verifyCredentials } from "@/lib/auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") || "");
  const password = String(form.get("password") || "");
  const next = String(form.get("next") || "/");

  const ok = await verifyCredentials(username, password);
  if (!ok) {
    return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(next)}`, request.url), {
      status: 303,
    });
  }

  const sessionToken = authConfig().sessionToken;
  if (!sessionToken) {
    return NextResponse.redirect(new URL("/login?error=notoken", request.url), { status: 303 });
  }

  const response = NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", request.url), {
    status: 303,
  });
  response.cookies.set(authCookieName, sessionToken, {
    httpOnly: true,
    maxAge: 60 * 60 * 12,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
