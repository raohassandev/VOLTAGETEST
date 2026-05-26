/**
 * In-process event bus — singleton EventEmitter shared by broker, worker, and SSE route.
 *
 * Events:
 *   "telemetry"      { deviceId, data }   — new telemetry row persisted
 *   "alarm"          { alarm }             — alarm created or updated
 *   "device-online"  { clientId }         — board connected to broker
 *   "device-offline" { clientId }         — board disconnected from broker
 *   "mqtt-message"   { topic, payload }   — raw MQTT message (before processing)
 *   "scan-result"    { discovered[] }     — LAN scan completed
 *
 * FIXME: EventEmitter is per-process. If Next.js ever runs in cluster mode this breaks.
 * Document: UMS must run as a single Node.js process (not PM2 cluster).
 */

import { EventEmitter } from "events";

// Module-level singleton — safe in Next.js instrumentation.ts context.
const _bus = new EventEmitter();
_bus.setMaxListeners(50);

export function getEventBus(): EventEmitter {
  return _bus;
}
