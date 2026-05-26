/**
 * Server-side proxy for reading board endpoints (/api/info, /data, etc.)
 * Avoids CORS issues when fetching from the browser.
 *
 * GET /api/board-proxy?ip=<boardIp>&path=<endpoint>
 */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

export async function GET(request: Request) {
  const auth = requireRole(request, "manufacturer");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const ip   = searchParams.get("ip")?.trim();
  const path = searchParams.get("path")?.trim() ?? "api/info";

  if (!ip) return NextResponse.json({ error: "ip param required" }, { status: 400 });
  // Validate IP/hostname — basic sanity check
  if (!/^[\w.\-]+$/.test(ip)) return NextResponse.json({ error: "invalid ip" }, { status: 400 });

  try {
    const res = await fetch(`http://${ip}/${path}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return NextResponse.json({ error: `Board returned ${res.status}` }, { status: 502 });
    const data: unknown = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Board unreachable", detail: String(err) }, { status: 503 });
  }
}
