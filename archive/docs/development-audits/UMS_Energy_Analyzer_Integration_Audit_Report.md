# UMS Energy Analyzer Integration â€” Deep Audit Report

## Scope

Audited uploaded ZIP:

`/mnt/data/VOLTAGETEST-energy-analyzer-integration.zip`

This pass checked:
- Web dashboard build/lint status
- Firmware source
- MQTT topic alignment
- Docker/deployment files
- Prisma schema/migrations
- MQTT worker
- Telemetry latest/history APIs
- Rollup worker
- Alarm engine/rules
- UI/UX from screenshots
- OTA/LAN scan/config/command paths
- RBAC/session behavior by source inspection

## Tests Actually Run in Sandbox

| Test | Result |
|---|---|
| ZIP extraction | PASS |
| `npm ci --ignore-scripts` | PASS |
| `npm run lint` | PASS |
| `npm run build` | FAIL in sandbox because Prisma engine download failed |
| `npx prisma generate` | FAIL in sandbox: DNS `EAI_AGAIN binaries.prisma.sh` |
| Shell syntax check: `certify.sh`, `setup-passwords.sh`, backups | PASS |
| Docker compose runtime | NOT RUN â€” Docker unavailable in sandbox |
| Firmware compile | NOT RUN â€” `arduino-cli` / `pio` unavailable in sandbox |

Build failure reason is environmental in this sandbox: Prisma could not download query-engine binaries, so Prisma Client was not generated. The code may build on Claude/local machine, but this sandbox did not certify the build.

---

# Executive Verdict

The uploaded ZIP is now much closer than the previous stale ZIP. It contains:

- Energy analyzer firmware
- Canonical firmware path
- New MQTT topic in worker
- New API latest/history fields
- Telemetry1m energy migration
- Dark UI theme
- Updated dashboard cards
- Session-expiry helper
- New alarm metrics in UI/source

However, this project is **not yet final-release complete** because several real issues remain:

1. Docker compose still defaults to the old MQTT topic if `.env` is missing or wrong.
2. Firmware publishes to MQTT without username/password, so it cannot publish to production Mosquitto with ACL enabled.
3. Firmware does not implement `/api/info`, but LAN scanner expects `/api/info`.
4. Worker stores `null` energy fields as `0`, which is dangerous for PF/frequency/Q alarms and UI accuracy.
5. Alarm engine declares new metrics but worker does not pass new values into `evaluateAlarms`, so new alarm rules will not work.
6. Certification script expects `DOCKER-SMOKE-001` MQTT user but setup script only creates `dashboard`.
7. Config route still uses embedded broker only; Docker external MQTT mode can fail.
8. Dashboard shows all devices offline; real flashed firmware board is not visible in screenshots.
9. Firmware hardware calibration is not complete: frequency null, DC voltage 0, voltage scale uncalibrated.
10. Firmware cannot be called hardware-certified until calibrated and compared against reference meters.

---

# Completed Items

## 1. Firmware source present

Canonical firmware file exists:

`firmware/VOLTAGETEST/VOLTAGETEST.ino`

Root copy also exists:

`VOLTAGETEST.ino`

Compiled binary files are included under:

`firmware/VOLTAGETEST/build/esp32.esp32.esp32/`

The firmware includes:

- 1-second sampling window
- `MQTT_PUBLISH_MS 1000UL`
- RMS calculation
- instantaneous V Ã— I power calculation
- PF calculation
- unsigned Q calculation
- kWh integration
- NVS energy persistence every 60 seconds
- HTTP OTA endpoint at `/update`
- Local config page `/`
- Data endpoint `/data`
- Calibration form `/calib`
- Energy reset endpoint `/resetenergy`

## 2. MQTT payload field list exists in firmware

Firmware publishes:

- `volt_in`
- `volt_out`
- `volt_dc`
- `ct_in`
- `ct_out`
- `s_in_va`
- `s_out_va`
- `freq_in`
- `freq_out`
- `p_in_w`
- `p_out_w`
- `pf_in`
- `pf_out`
- `q_in_var`
- `q_out_var`
- `e_in_kwh`
- `e_out_kwh`
- `rssi`
- `seq`
- `ip`

## 3. MQTT worker can parse and store energy fields

`web-dashboard/worker/mqtt-worker.ts` includes the new fields in `RawPayload` and writes them to:

- `TelemetryRaw`
- `TelemetryLatest`

## 4. Latest API exposes new energy fields

`/api/telemetry/latest` now returns:

- `p_in_w`
- `p_out_w`
- `pf_in`
- `pf_out`
- `e_in_kwh`
- `e_out_kwh`
- `freq_in`
- `freq_out`
- `q_in_var`
- `q_out_var`

## 5. History API exposes raw and rollup fields

`/api/telemetry/history` now includes new fields in short-range raw telemetry and long-range 1-minute rollup response.

## 6. Prisma schema contains live and rollup fields

`TelemetryRaw` and `TelemetryLatest` include power/PF/energy/frequency/Q fields.

`Telemetry1m` includes:

- `freqInAvg`
- `freqOutAvg`
- `pInWAvg`
- `pInWMax`
- `pOutWAvg`
- `pOutWMax`
- `pfInAvg`
- `pfOutAvg`
- `qInVarAvg`
- `qOutVarAvg`
- `eInKwhLast`
- `eOutKwhLast`

## 7. Rollup uses latest kWh by timestamp, not MAX

Rollup uses a `DISTINCT ON` CTE ordered by `receivedAt DESC` for kWh last values. This is correct direction.

## 8. UI has energy fields

Dashboard screenshot shows fields like:

- Out W
- PF
- Hz
- kWh
- Live Out W summary

Settings limitation text is updated to energy-analyzer wording.

## 9. Session-expiry helper exists

`src/lib/handle-unauthorized.ts` redirects to `/welcome?expired=1` on first `401`.

It is used in many pages and telemetry polling.

## 10. Dark theme is visually active

Screenshots show the dark IoT theme on:

- Dashboard
- Alarms
- Inventory
- Alarm Rules
- Boards
- Settings
- Users

---

# Critical Remaining Issues

## P0-1 â€” Docker compose default MQTT topic is still old

File:

`deployment/docker-compose.yml`

Current default:

`building/+/ups/+/telemetry`

Expected new standard:

`ums/devices/+/data`

This affects both:

- `web`
- `mqtt-worker`

Even though `.env.example` has the correct topic, Docker should not default to the old topic. A missing or wrong `.env` would silently break production telemetry.

### Required Fix

Change both compose defaults to:

`MQTT_TOPIC: ${MQTT_TOPIC:-ums/devices/+/data}`

---

## P0-2 â€” Firmware MQTT has no username/password support

Firmware uses bare MQTT over `WiFiClient` and sends only client ID.

Production Mosquitto ACL requires username/password:

- Device users publish to `ums/devices/%u/data`
- Dashboard user reads all device data

Firmware cannot authenticate to Mosquitto as written.

### Impact

Firmware may publish to public HiveMQ/open brokers, but will fail against production Mosquitto with ACL/passwords enabled.

### Required Fix

Firmware must support:

- MQTT host
- MQTT port
- MQTT username
- MQTT password

The MQTT CONNECT packet must include username/password flags and payload.

Board config page must allow editing MQTT username/password/port.

---

## P0-3 â€” Firmware does not expose `/api/info`, but LAN scanner requires it

LAN scanner probes:

`GET http://{ip}/api/info`

Firmware exposes:

- `/`
- `/data`
- `/save`
- `/calib`
- `/resetenergy`
- `/update`

No `/api/info`.

### Impact

Scan LAN cannot reliably identify boards.

### Required Fix

Add firmware route:

`GET /api/info`

Example response:

```json
{
  "device_id": "UMS-3076F5A5AD54",
  "firmware": "1.0.0",
  "ip": "192.168.0.100",
  "mac": "30:76:F5:A5:AD:54",
  "mqtt_topic": "ums/devices/UMS-3076F5A5AD54/data"
}
```

---

## P0-4 â€” Worker converts `null` energy fields to `0`

In `mqtt-worker.ts`, nullable fields are handled like:

```ts
payload.freq_in !== undefined ? num(payload.freq_in) : null
```

But if firmware publishes:

```json
"freq_in": null
```

Then `payload.freq_in !== undefined` is true, and `Number(null)` becomes `0`.

### Impact

Invalid frequency/PF/Q/W values can become zero instead of null.

This can cause:

- Wrong UI display
- Wrong alarm rules
- False low frequency alarms
- False PF alarms
- Incorrect history/rollup data

### Required Fix

Add safe nullable parser:

```ts
function nullableNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
```

Use it for:

- `pInW`
- `pOutW`
- `pfIn`
- `pfOut`
- `eInKwh`
- `eOutKwh`
- `freqIn`
- `freqOut`
- `qInVar`
- `qOutVar`

Consider also using it for old fields if firmware may publish null.

---

## P0-5 â€” Alarm engine does not receive new fields from worker

`TelemetrySnapshot` supports new fields and `snapValues` includes them.

But `mqtt-worker.ts` calls `evaluateAlarms()` with only:

- voltIn
- voltOut
- voltDc
- ctIn
- ctOut
- sInVa
- sOutVa

It does not pass:

- pInW
- pOutW
- pfIn
- pfOut
- freqIn
- freqOut
- qInVar
- qOutVar
- eInKwh
- eOutKwh

### Impact

New Alarm Rules UI options may exist, but rules will never evaluate because snapshot values are undefined.

### Required Fix

Pass parsed nullable values into the `TelemetrySnapshot` object in `runAlarmEvaluation()`.

Then verify:

- create `pf_out` low rule
- publish `pf_out` below threshold
- alarm appears
- publish normal `pf_out`
- alarm clears with hysteresis

---

## P0-6 â€” Certification script and password setup mismatch

`certify.sh` publishes as:

`DOCKER-SMOKE-001`

But `setup-passwords.sh` creates only:

`dashboard`

The device user is only commented as an example.

### Impact

`certify.sh` can fail unless someone manually creates the device user.

### Required Fix

Either:

- `setup-passwords.sh` creates `DOCKER-SMOKE-001`, or
- `certify.sh` publishes using `dashboard` if ACL allows it, or
- `certify.sh` itself verifies/creates the test device user.

No manual undocumented step should be required.

---

## P0-7 â€” Current screenshots show live system not receiving real firmware board

Screenshots show:

- Total UPS: 3
- Online: 0
- Offline: 3
- Live Out W: blank/dash
- `UPS-SMOKE-001` exists
- Real flashed board `UMS-3076F5A5AD54` is not visible

Claude claimed:

- firmware publishing every 1 second
- device `UMS-3076F5A5AD54 @ 192.168.0.100`
- Docker worker receiving telemetry

These cannot both be true for the same UI/DB.

### Likely Causes

- Browser on `localhost:3303` dev DB, while Docker stack on `localhost:3000`
- Running worker writes to Docker DB, UI reads dev DB
- Device ID not linked to inventory
- Firmware publishes to broker not used by current UI server
- MQTT auth/topic mismatch

### Required Debug

Run on the actual machine:

```bash
curl -s -b cookies http://localhost:3303/api/telemetry/latest
curl -s -b cookies http://localhost:3000/api/telemetry/latest
```

Compare DB URLs used by dev server and Docker.

Check:

```sql
select "deviceId", online, "lastSeenAt", ip, firmware from "Device" order by "lastSeenAt" desc;
select "deviceId", "receivedAt", "pOutW", "pfOut", "freqIn", "eOutKwh" from "TelemetryLatest" order by "receivedAt" desc;
```

---

## P1-1 â€” Config route still uses embedded broker only

File:

`src/app/api/devices/[deviceId]/config/route.ts`

It calls `getBroker()` directly.

Docker production has:

`ENABLE_EMBEDDED_BROKER=false`

### Impact

Config push will fail in Docker mode.

### Required Fix

Either:

- implement external MQTT publish like command route, or
- return `501 Not Implemented` until firmware subscribes to config topics.

Do not show it as working if firmware does not subscribe.

---

## P1-2 â€” Firmware does not subscribe to command/config topics

Boards page says firmware does not support commands, which is honest.

But routes exist for command/config publish.

### Required Decision

Either:

- keep buttons disabled and endpoints clearly marked experimental, or
- implement firmware MQTT subscribe to:
  - `ums/devices/{device_id}/command`
  - `ums/devices/{device_id}/config`

Current firmware does not subscribe.

---

## P1-3 â€” Firmware payload does not include `firmware`

Worker supports firmware version, boards page displays firmware, but firmware JSON does not include `"firmware"`.

### Required Fix

Add firmware constant:

```cpp
#define FIRMWARE_VERSION "1.0.0"
```

Payload:

```json
"firmware": "1.0.0"
```

`/api/info` should also include firmware.

---

## P1-4 â€” MQTT broker host defaults to public HiveMQ

Firmware default:

`broker.hivemq.com`

For production/local UMS, this should default to local broker or be clearly configured.

### Required Fix

Either default to:

`ums-server.local`

or use setup mode requiring user to configure MQTT broker before field deployment.

---

## P1-5 â€” Firmware local config does not expose full board parameters

Current local config supports:

- SSID/password
- DHCP/static IP
- MQTT host
- device ID
- calibration

It does not expose:

- MQTT port
- MQTT username/password
- UPS ID
- site ID
- firmware metadata
- command/config topic status
- phase correction values

### Required Fix

Add these if manufacturer role/field configuration requires them.

---

## P1-6 â€” Light/Dark theme toggle is not implemented

Current UI is dark theme only.

If requirement is â€œlight and dark theme,â€ this is incomplete.

### Required Decision

If dark-only is acceptable for industrial NOC, document it.

If switchable theme is required, add:

- theme toggle
- persisted theme preference
- light theme tokens
- verify readability

---

## P1-7 â€” Firmware compile not independently run in sandbox

The ZIP contains binaries and build options, but I could not compile because no `arduino-cli` or PlatformIO exists here.

### Required

Claude/local machine should provide:

- exact compile command
- target FQBN
- compile success log
- generated binary hash

---

## P1-8 â€” Hardware calibration incomplete

Claude report says:

- `freq_in/out` null
- `volt_dc` 0 V
- ADC offset calibration needed
- voltage/current scaling needed

### Required

Before calling energy analyzer accurate:

- calibrate voltage input/output
- calibrate CT input/output
- connect battery/DC channel or mark unsupported
- calibrate ADC center offsets
- compare W/PF/kWh against reference meter

---

# UI/UX From Screenshots

## Good

- Dark theme is consistent and professional.
- Dashboard shows energy analyzer fields.
- Alarm page readable.
- Inventory page readable.
- Alarm Rules page readable.
- Boards page warning text is honest.
- Settings page limitation text is updated.
- No red Next.js overlay visible.
- Navigation compact and clean.

## Needs Improvement

- Offline opacity makes UPS card values too dim.
- Dashboard should show clearer â€œstale data / last seenâ€ labels on each offline card.
- `Live Out W` card is blank/dash while all devices offline; this is technically okay but should show `0` or `No live load` consistently.
- Test/smoke devices still visible.
- Old alarm comments remain and should be cleaned before handover.
- Mobile touch QA still not proven from screenshots.

---

# Completed vs Remaining

## Completed

1. Energy firmware source present.
2. MQTT 1-second constant present.
3. Firmware builds JSON with energy fields.
4. OTA route exists.
5. Local firmware config page exists.
6. Docker/Web theme integration exists.
7. Backend schema supports live energy fields.
8. Latest API returns energy fields.
9. History API returns energy fields.
10. Rollup schema and worker support energy fields.
11. Dashboard shows energy parameter layout.
12. UPS detail has energy field UI.
13. Settings limitation text updated.
14. Alarm Rules UI includes new metric options.
15. Shared frontend 401 handler exists.
16. Dark IoT theme visually active.
17. Dockerfile and worker Dockerfile are present.
18. Certification script syntax is valid.

## Remaining

### Must Fix Before Release Candidate

1. Docker compose default MQTT topic still old.
2. Firmware lacks MQTT auth support.
3. Firmware lacks `/api/info` for LAN scan.
4. Worker stores published `null` as `0`.
5. Worker does not pass energy fields into alarm evaluation.
6. Certify script and password setup mismatch.
7. Verify why dashboard shows all UPS offline despite claimed live firmware.
8. Config route is embedded-broker only.
9. Firmware payload lacks `firmware` field.
10. Real hardware calibration incomplete.

### Should Fix Before Customer Handover

1. Clean smoke/test devices.
2. Clean old junk alarm comments.
3. Add reference-meter validation report.
4. Add calibration guide for energy firmware.
5. Add firmware limitations page.
6. Add light theme only if required.
7. Add mobile touch QA screenshots.
8. Decide command/config MQTT support scope.

---

# Recommended Next Claude Prompt

```text
Do not add UI redesign or new features. Fix only release blockers in energy-analyzer-integration.

1. Fix Docker MQTT topic default:
   - deployment/docker-compose.yml must default MQTT_TOPIC to ums/devices/+/data for web and mqtt-worker.

2. Add firmware MQTT auth support:
   - Firmware must support MQTT host, port, username, password.
   - MQTT CONNECT packet must include username/password when configured.
   - Local config page must allow editing port/user/pass.
   - Firmware must still publish to ums/devices/{device_id}/data every 1 second.

3. Add firmware /api/info:
   - GET /api/info must return device_id, firmware, mac, ip, mqtt_topic, mqtt_host.
   - This is required for LAN scanner.

4. Fix nullable numeric parsing in mqtt-worker:
   - Add nullableNum().
   - Store JSON null as DB null, not 0.
   - Apply to pInW, pOutW, pfIn, pfOut, eInKwh, eOutKwh, freqIn, freqOut, qInVar, qOutVar.
   - Consider old fields if firmware can publish null.

5. Fix alarm engine integration:
   - mqtt-worker runAlarmEvaluation must pass new energy fields into evaluateAlarms().
   - Test pf_out low alarm create/clear.

6. Fix certify/password mismatch:
   - setup-passwords.sh must create DOCKER-SMOKE-001 or certify.sh must use a valid user.
   - No manual undocumented step.
   - certify.sh must verify all migrations and required tables/columns.

7. Fix config route:
   - Either publish config via external Mosquitto in Docker mode, or return 501 disabled.
   - Do not use embedded getBroker only in production.

8. Add firmware version:
   - FIRMWARE_VERSION constant.
   - Include firmware in MQTT payload and /api/info.

9. Explain dashboard offline mismatch:
   - Identify which server/DB UI is reading.
   - Show Device and TelemetryLatest rows for UMS-3076F5A5AD54.
   - Link device to inventory or explain why it appears unassigned/offline.

10. Run tests:
   - npm run lint
   - npm run build
   - firmware compile
   - docker compose up -d --build
   - external MQTT publish 1/sec for 60 sec
   - TelemetryRaw count increases
   - TelemetryLatest updates
   - /api/telemetry/latest returns energy fields
   - dashboard shows live device online
   - LAN scan finds /api/info board
   - pf_out alarm rule test
   - certify.sh full pass

Final report:
- Branch
- Commit
- Files changed
- Firmware compile result
- MQTT auth test
- MQTT 1-second proof
- /api/info test
- Docker topic test
- Telemetry latest result
- Dashboard online result
- Alarm rule test
- certify.sh result
- Remaining hardware calibration
```

---

# Final Ship Decision

Current state:

`Engineering integration in progress`

Not acceptable yet:

`Production release`

Reason:

The system is visually close and backend integration is mostly present, but production telemetry can still fail because firmware cannot authenticate to Mosquitto, LAN scan cannot identify boards, nullable fields are stored incorrectly, and energy alarm evaluation is incomplete.
