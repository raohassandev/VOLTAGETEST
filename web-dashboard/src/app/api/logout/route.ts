import { NextResponse } from "next/server";
import { authCookieName } from "@/lib/auth";
import { USER_COOKIE } from "@/lib/api-auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/welcome", request.url), { status: 303 });
  response.cookies.delete(authCookieName);
  response.cookies.delete(USER_COOKIE);
  return response;
}
