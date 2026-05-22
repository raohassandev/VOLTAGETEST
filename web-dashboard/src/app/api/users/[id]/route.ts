import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma, isDbEnabled } from "@/lib/db";
import { requireRole } from "@/lib/api-auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;
  if (!isDbEnabled()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  const { id } = await params;
  const body = (await request.json()) as { active?: boolean; role?: string; password?: string };

  const data: Record<string, unknown> = {};
  if (body.active !== undefined) data.active = body.active;
  if (body.role !== undefined) {
    if (!["admin", "technician", "viewer"].includes(body.role))
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    data.role = body.role;
  }
  if (body.password !== undefined) {
    if (body.password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    data.passwordHash = await bcrypt.hash(body.password, 10);
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, role: true, active: true, createdAt: true },
    });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, "admin");
  if (!auth.ok) return auth.response;
  if (!isDbEnabled()) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  const { id } = await params;

  // Prevent deleting self
  const { username } = auth.user;
  const target = await prisma.user.findUnique({ where: { id }, select: { username: true } });
  if (target?.username === username) return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });

  try {
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
}
