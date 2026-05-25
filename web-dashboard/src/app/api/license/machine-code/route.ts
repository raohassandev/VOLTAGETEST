import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { getMachineCode } from "@/lib/license/machine-code";

export async function GET(request: Request) {
  const auth = requireRole(request, "manufacturer");
  if (!auth.ok) return auth.response;
  return NextResponse.json({ machineCode: getMachineCode(), fingerprintVersion: "v1" });
}
