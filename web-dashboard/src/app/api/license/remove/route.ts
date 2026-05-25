import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma, isDbEnabled } from "@/lib/db";
import { logAudit, requestIp } from "@/lib/audit";

export async function POST(request: Request) {
  const auth = requireRole(request, "manufacturer");
  if (!auth.ok) return auth.response;
  if (!isDbEnabled()) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });

  await prisma.systemLicense.updateMany({
    where: { id: "active" },
    data: { status: "deactivated", lastVerifiedAt: new Date() },
  });
  await logAudit({
    userId: auth.user.username,
    action: "license.remove",
    entity: "SystemLicense",
    data: {},
    ip: requestIp(request),
  });
  return NextResponse.json({ ok: true });
}
