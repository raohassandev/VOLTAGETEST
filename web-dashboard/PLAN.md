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
  Works on any LAN without any config. Survives DHCP IP changes.

Layer 2 — UDP broadcast
  Board sends UDP broadcast to 255.255.255.255:47808 ("UMS_DISCOVER").
  Server hears it, replies with its IP.
  Board saves IP to flash, connects.

Layer 3 — Manual fallback
  Board runs a tiny HTTP server on port 80.
  User opens http://{board-ip} in browser.
  Fills in server IP. Board saves to flash.
  Dashboard has a "Scan & Configure Board" tool to help find the board IP.
```

### Server finds boards (3 layers)

```
Layer 1 — MQTT connect event
  Board connects → Aedes fires client.connect.
  device_id parsed from client ID ("ums-{device_id}") or first telemetry message.
  Device upserted in DB immediately. Appears on dashboard within seconds.

Layer 2 — mDNS browse
  Server listens for "_ums-board._tcp.local" service announcements.
  Boards that advertise themselves appear here even before sending telemetry.

Layer 3 — LAN scanner (every 5 min)
  Reads OS ARP table for all IPs currently on subnet.
  Probes port 80 on each → checks for UMS board HTTP API response.
  Cross-references MAC against Device table.
  Shows "discovered but not connected" in Boards page.
  User clicks "Add to fleet" to register.
```

---

## Implementation Phases

### PHASE 1 — Database: Add Missing Telemetry Fields
**Status:** [ ] TODO

Fields currently missing from `TelemetryRaw` and `TelemetryLatest`:
- `qInVar`   — reactive power input (VAR)
- `qOutVar`  — reactive power output (VAR)
- `freqIn`   — input frequency (Hz)
- `freqOut`  — output frequency (Hz)

Also rename confusing fields for clarity (non-breaking, additive only):
- `voltDc` → keep but also map `v_batt` from new payload
- `sInVa` / `sOutVa` — keep (apparent power)

Tasks:
- [ ] Write Prisma migration: add `qInVar`, `qOutVar`, `freqIn`, `freqOut` to both tables
- [ ] Run migration on local dev DB
- [ ] Update worker ingestion to map new payload fields

---

### PHASE 2 — Embedded MQTT Broker (Aedes)
**Status:** [ ] TODO

Replace external Mosquitto dependency with `aedes` running inside the Node.js process.

Tasks:
- [ ] `npm install aedes @types/aedes`
- [ ] Create `src/lib/broker.ts` — Aedes instance, TCP server on port 1883, WS server on port 1884
- [ ] Wire into `instrumentation.ts` → broker starts when Next.js starts
- [ ] Broker authenticates boards (optional, open by default for LAN)
- [ ] Broker fires `client.connect` / `client.disconnect` events → update Device.online in DB
- [ ] Remove dependency on `MQTT_BROKER_URL` env var (broker is now internal)
- [ ] Keep `MQTT_BROKER_URL` as optional override (for cloud bridge later)

<!-- TODO: add Aedes persistence adapter (aedes-persistence-redis or in-memory) for QoS1 guarantee -->
<!-- TODO: consider WS on port 1884 so browser-based boards can connect directly -->

---

### PHASE 3 — Worker In-Process (move into instrumentation.ts)
**Status:** [ ] TODO

Currently the worker is a separate process (`npm run worker:dev`).  
Move it into `instrumentation.ts` so everything starts with `npm run dev` / `npm start`.

Tasks:
- [ ] Extract core worker logic into `src/lib/telemetry-worker.ts`
- [ ] Update `instrumentation.ts` to call `startTelemetryWorker()` after broker starts
- [ ] Update payload mapping to new field names (`v_in`, `i_in`, etc.)
- [ ] Update topic from `building/+/ups/+/telemetry` to `ums/devices/+/telemetry`
- [ ] Keep old topic as fallback for backward compat with existing board firmware
- [ ] Remove `worker/` directory entry from `package.json` scripts (keep file, deprecate)

<!-- TODO: graceful shutdown — broker.close() + prisma.$disconnect() on SIGINT/SIGTERM -->
<!-- FIXME: current worker has no dedup guard if run in parallel — fix before merging in-process -->

---

### PHASE 4 — mDNS Advertisement
**Status:** [ ] TODO

Server broadcasts `ums-server.local` on port 1883 so boards resolve it by name.

Tasks:
- [ ] `npm install mdns-js` (or `bonjour-service` — pure JS, no native deps)
- [ ] Create `src/lib/mdns.ts` — advertise `_mqtt._tcp.local` on port 1883 as `ums-server`
- [ ] Wire into `instrumentation.ts`
- [ ] Also advertise `_ums-dashboard._tcp.local` on port 3303 for LAN browser discovery
- [ ] Test: board firmware resolves `ums-server.local` → connects without hardcoded IP

<!-- TODO: handle mDNS failure gracefully (some VMs / Windows Firewall blocks mDNS) -->
<!-- TODO: log resolved hostname on startup so user can see "Board can find server at ums-server.local" -->

---

### PHASE 5 — LAN Scanner
**Status:** [ ] TODO

Background job scans local subnet every 5 minutes.  
Finds boards that are on the LAN but not sending MQTT.

Tasks:
- [ ] Create `src/lib/lan-scanner.ts`
  - [ ] Detect local subnet from OS network interfaces
  - [ ] Read ARP table (`arp -a` on Windows, parse output)
  - [ ] For each IP in ARP table, probe port 80 for UMS board HTTP API (`GET /api/info`)
  - [ ] Cross-reference MAC with `Device` table
  - [ ] Upsert `DeviceDiscovered` table (new): `{ ip, mac, lastSeenOnLan, boardApiConfirmed }`
- [ ] Wire scanner into `instrumentation.ts` (run every 5 min)
- [ ] New API route: `GET /api/discovered` — returns LAN-found devices
- [ ] Boards page updated to show discovered-but-not-connected devices

<!-- TODO: add DB table DeviceDiscovered in Prisma schema -->
<!-- TODO: Windows ARP table parsing — handle both IPv4 and IPv6 entries -->
<!-- FIXME: ARP scan only shows devices that have recently communicated — complement with ICMP ping sweep for complete picture -->

---

### PHASE 6 — Server-Sent Events (SSE) for Live Dashboard
**Status:** [ ] TODO

Replace 15-second polling in AppShell and dashboard with SSE push.

Tasks:
- [ ] Create `src/app/api/events/route.ts` — SSE endpoint
- [ ] Broker emits events to a global EventEmitter on each telemetry message
- [ ] SSE handler subscribes to EventEmitter, pushes to connected browsers
- [ ] Update dashboard page to use SSE instead of `setInterval` polling
- [ ] Update AppShell alarm count to use SSE
- [ ] Fallback to polling if SSE connection drops

<!-- TODO: consider using a proper pub/sub (EventEmitter singleton) — not Redis, keep it in-process -->
<!-- FIXME: SSE will not work across multiple Next.js worker processes — ensure single process mode in prod config -->

---

### PHASE 7 — Boards Page: Discovery + Status
**Status:** [ ] TODO

Current boards page only shows devices from DB.  
Update to show all three states: MQTT-active / LAN-visible / offline.

Tasks:
- [ ] Update `GET /api/devices` to include discovered-but-not-connected boards
- [ ] Boards page: add "Discovered" tab / section
- [ ] For each discovered board: show IP, MAC, "Configure" button
- [ ] "Configure" action: open board's HTTP config page (`http://{ip}/`) in new tab
- [ ] Manual "Scan Now" button → triggers immediate LAN scan

---

### PHASE 8 — Board Config Push (MQTT)
**Status:** [ ] TODO

Server can push configuration to a connected board via MQTT.

Tasks:
- [ ] Define config payload schema (calibration scales, reporting interval, broker URL)
- [ ] `POST /api/devices/{deviceId}/config` → publishes to `ums/devices/{deviceId}/config`
- [ ] `POST /api/devices/{deviceId}/command` → publishes reboot / OTA trigger
- [ ] Calibration page wired to push config on save
- [ ] Show "Config sent — waiting for ack" UI state

<!-- TODO: board should publish ack on ums/devices/{deviceId}/config/ack -->
<!-- TODO: OTA: board firmware update via MQTT requires firmware binary hosting — defer to Phase R (remote) -->

---

### PHASE 9 — Windows Installer Package
**Status:** [ ] TODO

Single `.exe` installer. User runs it, everything is set up.

Tasks:
- [ ] Choose installer tool: **Inno Setup** (free, battle-tested, scriptable)
- [ ] Installer script installs:
  - [ ] PostgreSQL 16 (silent, bundled or downloaded)
  - [ ] Node.js LTS (silent, bundled or downloaded)
  - [ ] UMS app files
- [ ] Post-install steps:
  - [ ] Create DB + run Prisma migrations automatically
  - [ ] Register UMS as Windows Service via NSSM (Non-Sucking Service Manager)
  - [ ] Open Windows Firewall ports: 1883 (MQTT), 3303 (dashboard)
  - [ ] Create desktop shortcut → `http://localhost:3303`
  - [ ] Create Start Menu entry
- [ ] Uninstaller: removes service, closes firewall ports, optionally removes DB
- [ ] Generate `.env` during install wizard (ask: server name, admin password)

<!-- TODO: research bundling PostgreSQL portable vs requiring separate install -->
<!-- TODO: code-sign the installer .exe (requires certificate — defer) -->
<!-- FIXME: Node.js version pinning — installer must use same Node version app was tested on -->

---

### PHASE R — Remote Access (FUTURE, not in scope now)
**Status:** [ ] DEFERRED

After local-first is complete and tested:
- Cloud MQTT bridge (local broker bridges to cloud broker when internet available)
- Remote dashboard access via VPN or reverse proxy
- Multi-site management from single cloud dashboard
- OTA firmware updates triggered from cloud

---

## Current State of This Branch

| # | Phase | Status | Notes |
|---|-------|--------|-------|
| 1 | DB fields | ⬜ TODO | Add qInVar, qOutVar, freqIn, freqOut |
| 2 | Aedes broker | ⬜ TODO | Replace Mosquitto |
| 3 | Worker in-process | ⬜ TODO | Move into instrumentation.ts |
| 4 | mDNS | ⬜ TODO | |
| 5 | LAN scanner | ⬜ TODO | |
| 6 | SSE live updates | ⬜ TODO | |
| 7 | Boards page | ⬜ TODO | |
| 8 | Board config push | ⬜ TODO | |
| 9 | Windows installer | ⬜ TODO | |

---

## Dev Environment

- Machine IP: `192.168.0.111`
- Dashboard: `http://localhost:3303`
- Real board: `DEV-COM11-TEST` at `192.168.0.100`, firmware `0.5.2`
- DB: PostgreSQL 16, `ums_local`, `ums_user` / `ums_password`
- Current broker: external at `54.36.178.49:1883` (internet-dependent — will be replaced by Aedes in Phase 2)

---

## MQTT Payload Contract (v2 — new firmware)

```json
{
  "device_id": "UMS-A4E2F1",
  "ts":  1716230400,
  "seq": 1042,

  "v_in":     230.5,
  "i_in":     10.2,
  "p_in_w":   2300.1,
  "pf_in":    0.98,
  "q_in_var": 450.2,
  "e_in_kwh": 145.6,
  "f_in_hz":  50.01,

  "v_out":     229.8,
  "i_out":     9.8,
  "p_out_w":   2200.5,
  "pf_out":    0.97,
  "q_out_var": 430.1,
  "e_out_kwh": 140.2,
  "f_out_hz":  50.00,

  "v_batt": 48.2,

  "rssi": -65,
  "ip":   "192.168.0.100",
  "fw":   "1.0.0"
}
```

### Legacy payload (v1 — existing firmware, still supported)
Old field names (`volt_in`, `volt_out`, `volt_dc`, `ct_in`, `ct_out`, `s_out_va`) continue to work via mapping in the worker.

---

## Pragma Mark Legend

```
// TODO: something that must be done before this phase is complete
// FIXME: known bug or fragile code that must be fixed
// HACK: temporary workaround — must be revisited
// NOTE: important context for future developers
```
