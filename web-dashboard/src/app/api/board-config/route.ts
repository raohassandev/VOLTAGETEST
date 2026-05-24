/**
 * Server-side proxy: push config to a board via its HTTP /save endpoint.
 * Avoids CORS — the browser calls this API, which calls the board from the server.
 *
 * POST /api/board-config
 * Body: { ip, ssid?, pass?, mqttHost, mqttPort?, mqttUser?, mqttPass?, deviceId?, mode?, staticIp?, gw?, sn? }
 */
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";

interface BoardSavePayload {
  ip: string;           // board IP to send config to
  ssid?:     string;
  pass?:     string;    // blank = keep existing
  mqttHost:  string;
  mqttPort?: number;
  mqttUser?: string;
  mqttPass?: string;    // blank = keep existing
  deviceId?: string;
  mode?:     "dhcp" | "static";
  staticIp?: string;
  gw?:       string;
  sn?:       string;
}

export async function POST(request: Request) {
  const auth = requireRole(request, "manufacturer");
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as BoardSavePayload;
  if (!body.ip || !body.mqttHost)
    return NextResponse.json({ error: "ip and mqttHost are required" }, { status: 400 });

  // Build URL-encoded form body matching firmware /save handler
  const form = new URLSearchParams({
    ssid:     body.ssid     ?? "",
    pass:     body.pass     ?? "",
    mqttHost: body.mqttHost,
    mqttPort: String(body.mqttPort ?? 1883),
    mqttUser: body.mqttUser ?? "",
    mqttPass: body.mqttPass ?? "",
    deviceId: body.deviceId ?? "",
    mode:     body.mode     ?? "dhcp",
    ip:       body.staticIp ?? "",
    gw:       body.gw       ?? "",
    sn:       body.sn       ?? "255.255.255.0",
  });

  try {
    const res = await fetch(`http://${body.ip}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text().catch(() => "");
    return NextResponse.json({ ok: res.ok, status: res.status, body: text });
  } catch (err) {
    return NextResponse.json(
      { error: "Could not reach board", detail: String(err) },
      { status: 503 },
    );
  }
}
