import { NextResponse } from "next/server";

/**
 * Minimal public health endpoint — used by Docker HEALTHCHECK and load balancers.
 * Returns 200 { status: "ok" } as long as the Next.js process is alive.
 * Does NOT expose database state, MQTT details, or any internal metrics.
 * For full system diagnostics see GET /api/system/health (admin only).
 */
export async function GET() {
  return NextResponse.json(
    { status: "ok", uptime: Math.round(process.uptime()) },
    { status: 200 },
  );
}
