import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma, isDbEnabled } from "@/lib/db";
import { getLicenseStatus } from "@/lib/license/status";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;
  if (!isDbEnabled()) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  return NextResponse.json(await getLicenseStatus(prisma));
}
