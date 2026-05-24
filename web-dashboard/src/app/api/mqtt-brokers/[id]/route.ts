import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { prisma, isDbEnabled } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, "manufacturer");
  if (!auth.ok) return auth.response;
  if (!isDbEnabled()) return NextResponse.json({ error: "DB not enabled" }, { status: 503 });
  const { id } = await params;
  const body = (await request.json()) as Partial<{
    name: string; host: string; port: number;
    username: string; password: string; enabled: boolean; notes: string;
  }>;
  const broker = await prisma.mqttBroker.update({
    where: { id },
    data: {
      ...(body.name     !== undefined && { name:     body.name.trim()     }),
      ...(body.host     !== undefined && { host:     body.host.trim()     }),
      ...(body.port     !== undefined && { port:     Number(body.port)    }),
      ...(body.username !== undefined && { username: body.username.trim() }),
      ...(body.password !== undefined && { password: body.password        }),
      ...(body.enabled  !== undefined && { enabled:  body.enabled         }),
      ...(body.notes    !== undefined && { notes:    body.notes.trim()    }),
    },
  });
  return NextResponse.json({ broker });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, "manufacturer");
  if (!auth.ok) return auth.response;
  if (!isDbEnabled()) return NextResponse.json({ error: "DB not enabled" }, { status: 503 });
  const { id } = await params;
  await prisma.mqttBroker.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
