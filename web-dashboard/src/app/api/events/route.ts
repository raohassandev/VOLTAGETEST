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
 * NOTE: SSE is per-process. Must not run Next.js in cluster/multi-process mode.
 */

import { requireApiAuth } from "@/lib/api-auth";
import { getEventBus } from "@/lib/event-bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireApiAuth(request);
  if (!auth.ok) return auth.response;

  const bus = getEventBus();

  // If the client closes the connection before the stream is fully set up,
  // we can detect that via the request AbortSignal and skip listener setup.
  request.signal.addEventListener("abort", () => cleanup(), { once: true });

  const encoder = new TextEncoder();

  // Capture cleanup refs so both start() and cancel() can call the same teardown.
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let onTelemetry: ((d: unknown) => void) | undefined;
  let onOnline:    ((d: unknown) => void) | undefined;
  let onOffline:   ((d: unknown) => void) | undefined;
  let onScan:      ((d: unknown) => void) | undefined;
  let onAlarm:     ((d: unknown) => void) | undefined;

  function cleanup() {
    if (heartbeat !== undefined) { clearInterval(heartbeat); heartbeat = undefined; }
    if (onTelemetry) { bus.off("telemetry",     onTelemetry); onTelemetry = undefined; }
    if (onOnline)    { bus.off("device-online",  onOnline);   onOnline    = undefined; }
    if (onOffline)   { bus.off("device-offline", onOffline);  onOffline   = undefined; }
    if (onScan)      { bus.off("scan-result",    onScan);     onScan      = undefined; }
    if (onAlarm)     { bus.off("alarm",          onAlarm);    onAlarm     = undefined; }
  }

  const stream = new ReadableStream({
    start(controller) {
      function send(event: string, data: unknown) {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Client disconnected — cancel() will clean up
        }
      }

      // Send initial connected event
      send("connected", { ts: Date.now() });

      // Heartbeat every 30s to prevent proxy timeouts
      heartbeat = setInterval(() => send("heartbeat", { ts: Date.now() }), 30_000);

      onTelemetry = (d: unknown) => send("telemetry",      d);
      onOnline    = (d: unknown) => send("device-online",  d);
      onOffline   = (d: unknown) => send("device-offline", d);
      onScan      = (d: unknown) => send("scan-result",    d);
      onAlarm     = (d: unknown) => send("alarm",          d);

      bus.on("telemetry",      onTelemetry);
      bus.on("device-online",  onOnline);
      bus.on("device-offline", onOffline);
      bus.on("scan-result",    onScan);
      bus.on("alarm",          onAlarm);
    },
    // cancel() is called when the client disconnects or the response is aborted.
    cancel() {
      cleanup();
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
