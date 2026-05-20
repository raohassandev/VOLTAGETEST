import { NextResponse } from "next/server";

import { prisma, isDbEnabled } from "@/lib/db";

export async function GET() {
  const status: Record<string, unknown> = {
    status: "ok",
    uptime: process.uptime(),
    dbEnabled: isDbEnabled(),
  };

  if (isDbEnabled()) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      status.db = "connected";
    } catch {
      status.db = "error";
      status.status = "degraded";
    }
  }

  const code = status.status === "ok" ? 200 : 503;
  return NextResponse.json(status, { status: code });
}
