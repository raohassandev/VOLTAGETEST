import { NextResponse } from "next/server";
import { prisma, isDbEnabled } from "@/lib/db";
import { requireApiAuth } from "@/lib/api-auth";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;
  if (!isDbEnabled()) return NextResponse.json({ discovered: [] });

  const discovered = await prisma.deviceDiscovered.findMany({
    orderBy: { lastSeenAt: "desc" },
  });
  return NextResponse.json({ discovered });
}
