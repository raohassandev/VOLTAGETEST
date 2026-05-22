import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { runLanScan } from "@/lib/lan-scanner";

export async function POST(request: Request) {
  const auth = requireRole(request, "technician");
  if (!auth.ok) return auth.response;

  // Run scan in background, return immediately
  runLanScan().catch(console.error);
  return NextResponse.json({ ok: true, message: "Scan started" });
}
