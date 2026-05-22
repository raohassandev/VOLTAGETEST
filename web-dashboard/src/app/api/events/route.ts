/**
 * SSE endpoint — pushes real-time events to the browser dashboard.
 *
 * Events pushed:
 *   telemetry      { deviceId, data }
 *   device-online  { clientId }
 *   device-offline { clientId }
 *   scan-result    { discovered[] }
 *   alarm          { alarm }
 *   heartbeat      {} (every 30s to keep connection alive)
 *
 * FIXME: SSE is per-process. Must not run Next.js in cluster/multi-process mode.
 * TODO: add auth check — only authenticated sessions should receive SSE.
 */

import { getEventBus } from "@/lib/event-bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const bus = getEventBus();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      function send(event: string, data: unknown) {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Client disconnected — cleanup below
        }
      }

      // Send initial connected event
      send("connected", { ts: Date.now() });

      // Heartbeat every 30s to prevent proxy timeouts
      // TODO: clear this interval on client disconnect
      const heartbeat = setInterval(() => send("heartbeat", { ts: Date.now() }), 30_000);

      const onTelemetry     = (d: unknown) => send("telemetry",      d);
      const onOnline        = (d: unknown) => send("device-online",  d);
      const onOffline       = (d: unknown) => send("device-offline", d);
      const onScan          = (d: unknown) => send("scan-result",    d);
      const onAlarm         = (d: unknown) => send("alarm",          d);

      bus.on("telemetry",      onTelemetry);
      bus.on("device-online",  onOnline);
      bus.on("device-offline", onOffline);
      bus.on("scan-result",    onScan);
      bus.on("alarm",          onAlarm);

      // Cleanup when client disconnects
      return () => {
        clearInterval(heartbeat);
        bus.off("telemetry",      onTelemetry);
        bus.off("device-online",  onOnline);
        bus.off("device-offline", onOffline);
        bus.off("scan-result",    onScan);
        bus.off("alarm",          onAlarm);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
