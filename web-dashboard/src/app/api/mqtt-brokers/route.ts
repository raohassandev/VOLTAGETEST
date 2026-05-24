import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma, isDbEnabled } from "@/lib/db";

export async function GET(request: Request) {
  const auth = requireRole(request, "manufacturer");
  if (!auth.ok) return auth.response;
  if (!isDbEnabled()) return NextResponse.json({ brokers: [] });
  const brokers = await prisma.mqttBroker.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json({ brokers });
}

export async function POST(request: Request) {
  const auth = requireRole(request, "manufacturer");
  if (!auth.ok) return auth.response;
  if (!isDbEnabled()) return NextResponse.json({ error: "DB not enabled" }, { status: 503 });
  const body = (await request.json()) as {
    name: string; host: string; port?: number;
    username?: string; password?: string; notes?: string;
  };
  if (!body.name?.trim() || !body.host?.trim())
    return NextResponse.json({ error: "name and host are required" }, { status: 400 });
  const broker = await prisma.mqttBroker.create({
    data: {
      name: body.name.trim(),
      host: body.host.trim(),
      port: Number(body.port ?? 1883),
      username: body.username?.trim() ?? "",
      password: body.password ?? "",
      notes: body.notes?.trim() ?? "",
      enabled: true,
    },
  });
  return NextResponse.json({ broker }, { status: 201 });
}
