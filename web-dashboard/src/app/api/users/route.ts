import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma, isDbEnabled } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";
import { logAudit, requestIp } from "@/lib/audit";

export async function GET(request: Request) {
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;
  if (!isDbEnabled()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, role: true, active: true, createdAt: true },
  });
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;
  if (!isDbEnabled()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  const body = (await request.json()) as { username?: string; password?: string; role?: string };
  const { username, password, role = "viewer" } = body;

  if (!username || !password) return NextResponse.json({ error: "username and password required" }, { status: 400 });
  if (!["admin", "technician", "viewer"].includes(role))
    return NextResponse.json({ error: "role must be admin, technician, or viewer" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: { username, passwordHash, role },
      select: { id: true, username: true, role: true, active: true, createdAt: true },
    });
    await logAudit({ userId: auth.user.username, action: "user.create", entity: "User", entityId: user.id, data: { username, role }, ip: requestIp(request) });
    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Username already exists" }, { status: 409 });
  }
}
