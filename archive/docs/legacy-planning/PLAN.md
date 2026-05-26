# UMS — Local-First Architecture Plan

**Branch:** `local-first-architecture`
**Started:** 2026-05-22
**Status:** IN PROGRESS

---

## Vision

A self-contained Windows package that a customer installs once.
No internet required. No cloud account. No separate broker to manage.
ESP32 boards on the same LAN connect automatically and data flows instantly.

---

## Hardware — ESP32 Board

Measures and publishes over MQTT:

| Group   | Fields |
|---------|--------|
| Input   | `v_in`, `i_in`, `p_in_w`, `pf_in`, `q_in_var`, `e_in_kwh`, `f_in_hz` |
| Output  | `v_out`, `i_out`, `p_out_w`, `pf_out`, `q_out_var`, `e_out_kwh`, `f_out_hz` |
| Battery | `v_batt` |
| Device  | `device_id`, `ts`, `seq`, `rssi`, `ip`, `fw` |

MQTT topic published by board:
```
ums/devices/{device_id}/telemetry
```

Topics board subscribes to (server → board):
```
ums/devices/{device_id}/config      ← push calibration / settings
ums/devices/{device_id}/command     ← reboot / OTA trigger / reset energy
```

Board announces itself on connect via MQTT client ID: `ums-{device_id}`

---

## Target Architecture

```
┌──────────────────────────── USER'S PC ─────────────────────────────┐
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │               UMS Application (Single Node.js Process)       │   │
│  │                                                              │   │
│  │  ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐  │   │
│  │  │ Aedes MQTT   │─▶│  Telemetry    │─▶│   PostgreSQL     │  │   │
│  │  │ Broker       │  │  Worker       │  │   (local)        │  │   │
│  │  │ port 1883    │  │  + Alarms     │  │                  │  │   │
│  │  └──────────────┘  └───────────────┘  └────────┬─────────┘  │   │
│  │  ┌──────────────┐  ┌───────────────┐           │            │   │
│  │  │ mDNS Service │  │ LAN Scanner   │           │            │   │
│  │  │ ums.local    │  │ ARP + sweep   │           │            │   │
│  │  └──────────────┘  └───────────────┘           │            │   │
│  │                                                 ▼            │   │
│  │                    ┌───────────────────────────────────────┐ │   │
│  │                    │  Next.js  (API + SSE + Dashboard UI)  │ │   │
│  │                    │  port 3303                            │ │   │
│  │                    └───────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
         ▲ MQTT :1883                  ▲ HTTP :3303
   ┌─────┴──────┐                ┌─────┴──────┐
   │ ESP32      │                │ Browser    │
   │ Boards     │                │ any device │
   └────────────┘                └────────────┘
```

---

## Board ↔ Server Discovery

### Board finds server (3 layers, tried in order)

```
Layer 1 — mDNS
  Board resolves "ums-server.local" → gets server IP automatically.

Layer 2 — UDP broadcast
  Board sends UDP to 255.255.255.255:47808.
  Server replies with its IP. Board saves to flash.

Layer 3 — Manual fallback
  Board runs tiny HTTP server on port 80.
  User opens http://{board-ip}, enters server IP.
```

### Server finds boards (3 layers)

```
Layer 1 — MQTT connect event (instant)
Layer 2 — mDNS browse for "_ums-board._tcp.local"
Layer 3 — LAN ARP scan + port 80 probe every 5 min
```

---

## MQTT Payload Contract v2 (new firmware)

```json
{
  "device_id": "UMS-A4E2F1",
  "ts": 1716230400, "seq": 1042,
  "v_in": 230.5,  "i_in": 10.2,  "p_in_w": 2300.1,
  "pf_in": 0.98,  "q_in_var": 450.2, "e_in_kwh": 145.6, "f_in_hz": 50.01,
  "v_out": 229.8, "i_out": 9.8,  "p_out_w": 2200.5,
  "pf_out": 0.97, "q_out_var": 430.1, "e_out_kwh": 140.2, "f_out_hz": 50.00,
  "v_batt": 48.2,
  "rssi": -65, "ip": "192.168.0.100", "fw": "1.0.0"
}
```

Legacy v1 payload fields (`volt_in`, `volt_out`, `volt_dc`, `ct_in`, `ct_out`, `s_out_va`) are still mapped by the worker for backward compat.

---

## Implementation Phases

---

### PHASE 1 — Database: New Fields + Discovery Table
**Status:** ✅ DONE

**TODO list:**
- [x] Add `qInVar Float?` to TelemetryRaw
- [x] Add `qOutVar Float?` to TelemetryRaw
- [x] Add `freqIn Float?` to TelemetryRaw
- [x] Add `freqOut Float?` to TelemetryRaw
- [x] Add same 4 fields to TelemetryLatest
- [x] Add same 4 fields to Telemetry1m rollup
- [x] Add `DeviceDiscovered` model for LAN scan results
- [x] Add `lastSeenOnLan DateTime?` and `boardConfirmed Boolean` to DeviceDiscovered
- [x] Run `prisma migrate dev` — apply migration to local DB
- [x] Regenerate Prisma client

---

### PHASE 2 — Embedded Aedes MQTT Broker
**Status:** ✅ DONE

**TODO list:**
- [x] `npm install aedes @types/aedes`
- [x] Create `src/lib/broker.ts` — Aedes instance exported as singleton
- [x] TCP server on port 1883 bound to 0.0.0.0 (accepts LAN connections)
- [x] WebSocket server on port 1884 (future: browser/tablet boards)
- [x] Broker `client.connect` event → upsert Device.online=true in DB
- [x] Broker `client.disconnect` event → mark Device.online=false
- [x] Wire broker startup into `instrumentation.ts`
- [x] Remove hard requirement on `MQTT_BROKER_URL` env var
- [x] Log broker start with LAN IP so user can see the address

---

### PHASE 3 — Telemetry Worker In-Process
**Status:** ✅ DONE

**TODO list:**
- [x] Create `src/lib/telemetry-worker.ts` — all ingestion logic
- [x] Update `RawPayload` interface with v2 fields (q_in_var, q_out_var, f_in_hz, f_out_hz, v_batt)
- [x] Map v2 fields → DB columns in `persistTelemetry()`
- [x] Map legacy v1 fields alongside v2 (both work)
- [x] Subscribe to new topic `ums/devices/+/telemetry`
- [x] Subscribe to legacy topic `building/+/ups/+/telemetry` as fallback
- [x] Auto-register device on first message (upsert Device row)
- [x] Wire `startTelemetryWorker()` into `instrumentation.ts`
- [x] Keep `worker/mqtt-worker.ts` but mark deprecated with FIXME
- [x] Remove `MQTT_BROKER_URL` check (worker now connects to local broker)

<!-- FIXME: worker/mqtt-worker.ts is now deprecated — remove in next cleanup sprint -->

---

### PHASE 4 — mDNS Advertisement
**Status:** ✅ DONE

**TODO list:**
- [x] `npm install bonjour-service` (pure JS, no native addons, works on Windows)
- [x] Create `src/lib/mdns.ts` — advertise services on startup
- [x] Advertise `_mqtt._tcp` on port 1883 as name `ums-server`
- [x] Advertise `_http._tcp` on port 3303 as name `ums-dashboard`
- [x] Wire into `instrumentation.ts`
- [x] Graceful shutdown: `bonjour.destroy()` on process exit
- [x] Log advertised hostname so user can confirm

<!-- TODO: handle Windows Firewall blocking mDNS multicast (port 5353 UDP) — add note in installer -->

---

### PHASE 5 — LAN Scanner
**Status:** ✅ DONE

**TODO list:**
- [x] Create `src/lib/lan-scanner.ts`
- [x] Detect local subnet from `os.networkInterfaces()`
- [x] Read ARP table on Windows (`arp -a` → parse output)
- [x] Probe port 80 on each ARP entry for UMS board API (`GET /api/info` → expect `{"device_id":...}`)
- [x] Upsert `DeviceDiscovered` rows in DB
- [x] Cross-ref MAC against `Device` table → link if matched
- [x] Wire scanner into `instrumentation.ts` — run at startup + every 5 min
- [x] New API route `GET /api/discovered` — returns discovered devices
- [x] `POST /api/discovered/scan` — trigger immediate scan

<!-- FIXME: ARP table on Windows only shows devices that have communicated recently. Add ICMP ping sweep as complement in next iteration -->
<!-- TODO: test on Windows 11 — arp -a output format differs slightly from Windows 10 -->

---

### PHASE 6 — Server-Sent Events (SSE) Live Updates
**Status:** ✅ DONE

**TODO list:**
- [x] Create `src/lib/event-bus.ts` — in-process EventEmitter singleton
- [x] Telemetry worker emits `telemetry` event on each message → SSE pushes to browser
- [x] Create `src/app/api/events/route.ts` — SSE endpoint
- [x] Events: `telemetry`, `alarm`, `device-online`, `device-offline`, `scan-result`
- [x] Update dashboard `page.tsx` to connect to SSE and drop 15s polling
- [x] Update AppShell alarm count badge to use SSE
- [x] Reconnect logic: browser reconnects after 3s if SSE drops

<!-- FIXME: SSE breaks if Next.js runs multi-process (PM2 cluster mode). Document: must run single process. -->
<!-- TODO: add SSE heartbeat ping every 30s to detect stale connections -->

---

### PHASE 7 — Boards Page: Discovery + Live Status
**Status:** ✅ DONE

**TODO list:**
- [x] Update `GET /api/devices` to merge discovered devices
- [x] Boards page: three tabs — Connected (MQTT active), Discovered (LAN only), All
- [x] Each connected board: show live RSSI, firmware, IP, uptime
- [x] Each discovered board: show IP, MAC, "Open Config" button (opens board HTTP page)
- [x] Manual "Scan Now" button → POST /api/discovered/scan → show spinner
- [x] Auto-refresh boards list via SSE device-online / device-offline events
- [x] "Register" button on discovered boards → opens register modal (assigns UPS unit)

<!-- TODO: show board signal strength bar from RSSI value -->
<!-- TODO: firmware OTA trigger button — requires Phase 8 command support -->

---

### PHASE 8 — Board Config Push via MQTT
**Status:** ✅ DONE

**TODO list:**
- [x] `POST /api/devices/{deviceId}/config` → publish to `ums/devices/{deviceId}/config`
- [x] `POST /api/devices/{deviceId}/command` → publish to `ums/devices/{deviceId}/command`
- [x] Config payload schema: `{ reportingIntervalMs, calibration, brokerUrl }`
- [x] Command payload schema: `{ cmd: "reboot" | "reset-energy" | "ota", url? }`
- [x] Wire calibration page Save button → push config via MQTT after DB save
- [x] Show "Config pushed" toast in calibration UI
- [x] Boards page: "Send Command" dropdown (reboot, reset energy counters)

<!-- TODO: board should publish ack on ums/devices/{deviceId}/config/ack — track pending configs -->
<!-- TODO: OTA requires firmware binary hosting endpoint — defer to Phase R -->

---

### PHASE 9 — Windows Installer
**Status:** ✅ DONE


**TODO list:**
- [x] Add `output: 'standalone'` to next.config.ts — self-contained build
- [x] Add `start:prod` script — runs standalone server.js on correct port
- [x] Create `installer/` directory structure
- [x] Write `installer/setup.iss` — full Inno Setup 6 script
  - [x] Wizard page: install directory
  - [x] Wizard page: PostgreSQL connection (host, port, DB name, user, password)
  - [x] Wizard page: dashboard admin password
  - [x] Wizard page: MQTT port + dashboard port
  - [x] Silent Node.js LTS download check (use system node if available)
  - [x] Silent PostgreSQL 16 installer bundled (or download if not installed)
  - [x] Bundle NSSM 2.24 for Windows service management
- [x] Write `installer/scripts/post-install.ps1`
  - [x] Generate random UPS_AUTH_TOKEN
  - [x] Hash admin password with bcrypt
  - [x] Write `.env` file from wizard answers
  - [x] Run `prisma migrate deploy`
  - [x] Run `npm run db:seed`
  - [x] Register UMS service via NSSM
  - [x] Open firewall: port 1883 TCP inbound
  - [x] Open firewall: port 3303 TCP inbound
  - [x] Start the service
- [x] Write `installer/scripts/uninstall.ps1`
  - [x] Stop and remove NSSM service
  - [x] Remove firewall rules
  - [x] Optionally drop database
- [x] Write `installer/scripts/setup-db.ps1` — standalone DB init script
- [x] Create `installer/README.md` — how to compile the .exe
- [x] Write root `SETUP.ps1` — quick dev/test install without Inno Setup
- [x] Add `.nvmrc` with pinned Node version

<!-- TODO: code-sign installer .exe — requires cert purchase, defer to commercial release -->
<!-- TODO: bundle PostgreSQL portable zip instead of full installer to avoid admin prompt complexity -->
<!-- FIXME: bonjour-service requires Windows mDNS responder — test on clean install, add fallback warning -->

---

### PHASE R — Remote Access (FUTURE — not in scope)
**Status:** ⬜ DEFERRED

- Cloud MQTT bridge
- Remote dashboard via reverse proxy / VPN
- Multi-site management
- OTA firmware from cloud

---

## Progress Tracker

| # | Phase | Status | Files |
|---|-------|--------|-------|
| 1 | DB fields + DeviceDiscovered | ✅ DONE | prisma/schema.prisma |
| 2 | Aedes embedded broker | ✅ DONE | src/lib/broker.ts |
| 3 | Worker in-process | ✅ DONE | src/lib/telemetry-worker.ts, src/lib/event-bus.ts |
| 4 | mDNS advertisement | ✅ DONE | src/lib/mdns.ts |
| 5 | LAN scanner | ✅ DONE | src/lib/lan-scanner.ts, src/app/api/discovered/* |
| 6 | SSE live updates | ✅ DONE | src/app/api/events/route.ts |
| 7 | Boards page | ✅ DONE | src/app/admin/boards/page.tsx |
| 8 | Board config push | ✅ DONE | src/app/api/devices/[deviceId]/config|command |
| 9 | Windows installer | ✅ DONE | installer/setup.iss, installer/scripts/*, SETUP.ps1 |

---

## Dev Environment

- Machine IP: `192.168.0.111`
- Dashboard: `http://localhost:3303`
- Real board: `DEV-COM11-TEST` at `192.168.0.100`, firmware `0.5.2`
- DB: PostgreSQL 16, `ums_local`, user `ums_user` / `ums_password`
- Old external broker: `54.36.178.49:1883` — replaced by embedded Aedes

---

## Pragma Mark Legend

```
// TODO: must be done before phase is complete
// FIXME: known bug or fragile code — must fix
// HACK: temporary workaround — revisit
// NOTE: important non-obvious context
```
