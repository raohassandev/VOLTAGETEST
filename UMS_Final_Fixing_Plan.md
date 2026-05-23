# UMS Final Fixing Plan — Single Claude Prompt

Use this file as the **complete fixing plan**. Do not use tiny prompts. Do not assume anything is fixed unless verified from current branch code and tests.

---

## Objective

Complete the UMS project by integrating:

1. Certified Docker/runtime baseline
2. IoT dark UI theme
3. Firmware energy-analyzer branch
4. Backend storage, API, rollup, alarms
5. UI/UX alignment with real power/energy parameters
6. Final certification tests

Current critical requirement:

> Firmware must publish real main parameters every 1 second, and the UI must display them correctly.

Main parameters:

- Voltage
- Current
- Battery/DC voltage
- VA
- W/kW
- Power factor
- Frequency
- VAR/kVAR
- kWh energy counters

Do not fake unsupported values. If a field cannot be truly calculated from hardware/sampling, publish `null` and document why.

---

## Branch Strategy

Start from the latest UI branch, then integrate energy firmware.

```bash
git fetch origin
git checkout ui-iot-theme
git pull --ff-only origin ui-iot-theme
git checkout -B energy-analyzer-integration-final
```

Do not work on stale ZIPs. Do not overwrite certified tags.

Protected tags:

```text
ums-certification-candidate-v0.2.0
ums-ui-iot-theme-v0.2.1-rc
```

---

## Step 1 — Baseline Verification

Run first:

```bash
git status --short
git branch --show-current
git rev-parse --short HEAD
git log --oneline -10
```

Then:

```bash
cd web-dashboard
npm run lint
npm run build
```

If lint/build fails, fix only the failure before continuing.

---

## Step 2 — Bring Firmware Energy Analyzer into Latest UI Branch

Required files:

```text
VOLTAGETEST.ino
firmware/VOLTAGETEST/VOLTAGETEST.ino
firmware/README.md
```

Canonical Arduino sketch must be:

```text
firmware/VOLTAGETEST/VOLTAGETEST.ino
```

Root `VOLTAGETEST.ino` can stay as a copy/reference if already used, but canonical location must be documented.

---

## Step 3 — Firmware MQTT Requirements

Firmware must publish every 1 second.

Required constants/behavior:

```cpp
#define MQTT_PUBLISH_MS 1000UL
```

Firmware must log publish interval:

```text
[MQTT] published seq=<n> interval=<ms>
```

Required topic:

```text
ums/devices/{device_id}/data
```

Required payload fields:

```json
{
  "device_id": "ups-node-01",
  "volt_in": 230.12,
  "volt_out": 229.85,
  "volt_dc": 13.42,
  "ct_in": 2.310,
  "ct_out": 1.850,
  "s_in_va": 531.5,
  "s_out_va": 424.9,
  "freq_in": 50.00,
  "freq_out": 50.00,
  "p_in_w": 498.2,
  "p_out_w": 401.5,
  "pf_in": 0.937,
  "pf_out": 0.945,
  "q_in_var": 182.4,
  "q_out_var": 145.3,
  "e_in_kwh": 12.3456,
  "e_out_kwh": 11.8023,
  "rssi": -65,
  "seq": 1234,
  "ip": "192.168.1.100",
  "firmware": "..."
}
```

If a field is not valid, publish `null`, not fake zero.

---

## Step 4 — Firmware Calculation Rules

### RMS

```text
Vrms = sqrt(mean(v_sample^2))
Irms = sqrt(mean(i_sample^2))
```

### Apparent Power

```text
VA = Vrms × Irms
```

### Frequency

Use zero-crossing or period detection.

Required:

- reject noisy/invalid waveform
- publish `null` if not reliable
- expected accuracy target: document actual measured/estimated accuracy

### Real Power

Must be calculated from synchronized instantaneous samples:

```text
W = average(Vinstant × Iinstant)
```

Do not calculate W from RMS only.

### Power Factor

```text
PF = W / VA
```

Clamp safely:

```text
-1.0 <= PF <= 1.0
```

If W or VA invalid, publish `null`.

### Reactive Power

```text
Q = sqrt(VA² - W²)
```

If sign/direction is not reliable, publish unsigned Q and document:

```text
Reactive power sign is not available without reliable phase reference.
```

### Energy

```text
kWh += W × elapsed_hours / 1000
```

Requirements:

- persist in NVS/Preferences
- survive reboot
- document NVS write interval and possible energy loss window
- reset only through safe/protected action if implemented

---

## Step 5 — Firmware Calibration

Firmware must support/document:

```text
input voltage gain/offset
output voltage gain/offset
input CT gain/offset
output CT gain/offset
DC voltage gain/offset
input phase correction
output phase correction
```

If phase correction is stored but not applied, document clearly.

Required report table:

```text
Parameter             Status
Vin gain/offset       applied/not applied
Vout gain/offset      applied/not applied
CTin gain/offset      applied/not applied
CTout gain/offset     applied/not applied
DC gain/offset        applied/not applied
Phase correction in   stored only/applied
Phase correction out  stored only/applied
```

---

## Step 6 — MQTT Topic Alignment

Production standard:

```text
Firmware publishes: ums/devices/{device_id}/data
Docker worker subscribes: ums/devices/+/data
```

Update/verify:

```text
web-dashboard/worker/mqtt-worker.ts
web-dashboard/src/lib/mqtt-ingestion.ts
web-dashboard/.env.example
deployment/.env.example
deployment/certify.sh
firmware README
```

Search:

```bash
grep -R "building/.*/ups\|building/+/ups" -n .
```

Any old production topic must either be removed or clearly marked legacy.

---

## Step 7 — Backend Worker Field Mapping

Verify `web-dashboard/worker/mqtt-worker.ts` accepts and persists:

```text
volt_in -> voltIn
volt_out -> voltOut
volt_dc -> voltDc
ct_in -> ctIn
ct_out -> ctOut
s_in_va -> sInVa
s_out_va -> sOutVa
freq_in -> freqIn
freq_out -> freqOut
p_in_w -> pInW
p_out_w -> pOutW
pf_in -> pfIn
pf_out -> pfOut
q_in_var -> qInVar
q_out_var -> qOutVar
e_in_kwh -> eInKwh
e_out_kwh -> eOutKwh
```

Null must be accepted.

No field should be silently dropped.

---

## Step 8 — Prisma Schema and Migration

`TelemetryRaw` and `TelemetryLatest` must contain:

```text
pInW
pOutW
pfIn
pfOut
eInKwh
eOutKwh
freqIn
freqOut
qInVar
qOutVar
```

`Telemetry1m` must contain:

```text
freqInAvg
freqOutAvg
pInWAvg
pInWMax
pOutWAvg
pOutWMax
pfInAvg
pfOutAvg
qInVarAvg
qOutVarAvg
eInKwhLast
eOutKwhLast
```

Add Prisma migration if missing:

```bash
cd web-dashboard
npx prisma migrate dev --name add_telemetry1m_energy_fields
```

For production verification, use only:

```bash
npx prisma migrate deploy
```

Do not use `prisma db push`.

---

## Step 9 — Rollup Worker

Update:

```text
web-dashboard/worker/rollup.ts
```

Rollup requirements:

| Field | Rollup |
|---|---|
| pInW | AVG + MAX |
| pOutW | AVG + MAX |
| pfIn | AVG |
| pfOut | AVG |
| qInVar | AVG |
| qOutVar | AVG |
| freqIn | AVG |
| freqOut | AVG |
| eInKwh | LAST by receivedAt |
| eOutKwh | LAST by receivedAt |

Important:

> kWh is cumulative. Do not use AVG or MAX for eInKwhLast/eOutKwhLast.

Correct test:

```text
Same minute bucket:
first e_out_kwh = 100
later e_out_kwh = 0.2
rollup eOutKwhLast must be 0.2, not 100
```

Use `DISTINCT ON`, window function, or join with latest row by `receivedAt`.

---

## Step 10 — API Latest Must Expose New Fields

Update:

```text
web-dashboard/src/app/api/telemetry/latest/route.ts
```

GET response must include:

```text
p_in_w
p_out_w
pf_in
pf_out
e_in_kwh
e_out_kwh
freq_in
freq_out
q_in_var
q_out_var
```

Keep existing:

```text
volt_dc
volt_dc_raw
volt_dc_calibration_source
```

Verification:

```bash
curl -s -b /tmp/ums-cookies.txt http://localhost:3000/api/telemetry/latest | jq .
```

Must show new fields for latest telemetry.

---

## Step 11 — API History Must Expose New Fields

Update:

```text
web-dashboard/src/app/api/telemetry/history/route.ts
```

Raw history response must include:

```text
p_in_w
p_out_w
pf_in
pf_out
e_in_kwh
e_out_kwh
freq_in
freq_out
q_in_var
q_out_var
```

Rollup history response must include:

```text
freqInAvg
freqOutAvg
pInWAvg
pInWMax
pOutWAvg
pOutWMax
pfInAvg
pfOutAvg
qInVarAvg
qOutVarAvg
eInKwhLast
eOutKwhLast
```

Do not break old voltage/current/VA chart data.

---

## Step 12 — UI Telemetry Types

Update:

```text
web-dashboard/src/lib/telemetry-types.ts
web-dashboard/src/lib/telemetry.ts
```

Add nullable fields:

```ts
p_in_w?: number | null;
p_out_w?: number | null;
pf_in?: number | null;
pf_out?: number | null;
e_in_kwh?: number | null;
e_out_kwh?: number | null;
freq_in?: number | null;
freq_out?: number | null;
q_in_var?: number | null;
q_out_var?: number | null;
```

Normalizer must preserve `null` and not convert it to `0`.

---

## Step 13 — Dashboard UI Alignment

Update:

```text
web-dashboard/src/app/page.tsx
```

Main UPS card should show:

Primary:

```text
Out V
Out A
Out W
PF
Bat V
Out VA
```

Secondary:

```text
In V
In A
In W
Frequency
kWh Out
VAR Out
```

Summary row should show:

```text
Live Output W
Live Output VA
Energy Out kWh
Online/Offline
Critical/Warning
```

If null:

```text
Not available
```

or short card value:

```text
—
```

Tooltip/subtext:

```text
Firmware calibration required
```

Do not clutter card with every parameter at top level.

---

## Step 14 — UPS Detail UI Alignment

Update:

```text
web-dashboard/src/app/ups/[id]/page.tsx
```

Remove old text:

```text
Active power (W), power factor, and energy (kWh) are not computed...
```

Show metric cards/rows for:

```text
Input W
Output W
Input PF
Output PF
Input Frequency
Output Frequency
Input VAR
Output VAR
Input kWh
Output kWh
```

If null:

```text
Not available — firmware calibration required
```

---

## Step 15 — Settings / Limitations Text

Update:

```text
web-dashboard/src/app/admin/settings/page.tsx
```

Replace old limitation text with:

```text
Energy analyzer firmware supports W, PF, kWh, VAR, and frequency when waveform-sampling firmware is installed and calibrated.

Accuracy depends on voltage/current calibration, CT calibration, and phase alignment.

If a field is unavailable, firmware publishes null and the UI shows Not available.
```

If phase correction is not applied yet, state:

```text
Phase correction is stored but not yet applied in firmware v1.x.
```

---

## Step 16 — Alarm Engine and Alarm Rules

Update:

```text
web-dashboard/src/lib/alarm-engine.ts
web-dashboard/worker/mqtt-worker.ts
web-dashboard/src/app/admin/alarm-rules/page.tsx
```

Add selectable/evaluable metrics:

```text
p_out_w
p_in_w
pf_out
pf_in
freq_out
freq_in
q_out_var
q_in_var
e_out_kwh
e_in_kwh
```

Rules:

- Do not create default alarms for all new metrics.
- Make them selectable only.
- PF: low thresholds are common.
- Frequency: low/high thresholds.
- W/VAR: high thresholds.
- kWh: high threshold only usually makes sense.

Verification:

```text
Create pf_out low warning rule
Publish pf_out below threshold
Alarm created
Publish pf_out normal
Alarm clears with hysteresis
```

---

## Step 17 — Certification Script Update

Update:

```text
deployment/certify.sh
deployment/mosquitto/setup-passwords.sh
```

Certification script must verify all migrations:

```text
20260520000000_init
20260523000001_v2_fields
20260523120000_add_telemetry1m_energy_fields
```

Must verify required tables and Telemetry1m columns.

MQTT smoke topic:

```text
ums/devices/DOCKER-SMOKE-001/data
```

Smoke payload must include all energy fields.

Mosquitto setup must either:

- create `DOCKER-SMOKE-001`, or
- use `dashboard` if ACL allows publish to smoke topic.

No manual undocumented step.

---

## Step 18 — Embedded Config/Command Routes

Check these routes:

```text
src/app/api/devices/[deviceId]/command/route.ts
src/app/api/devices/[deviceId]/config/route.ts
```

Requirement:

- If embedded broker disabled in Docker, route must not call `getBroker()` only.
- Either:
  - publish through external Mosquitto using `MQTT_BROKER_URL`, or
  - return clear 501/disabled until firmware supports it.

Do not show active command/config buttons unless firmware subscribes and handles commands.

---

## Step 19 — Session Expiry

Use shared frontend 401 handler.

Required behavior:

- Protected API returns 401
- Redirect once to `/welcome?expired=1`
- No repeated 401 loop
- Do not redirect on 403
- App must not keep showing Admin/API Live after session expired

Apply to:

```text
AppShell
useTelemetry
Alarms page
UPS detail
Admin pages
```

---

## Step 20 — Firmware Compile Test

Compile canonical firmware:

```text
firmware/VOLTAGETEST/VOLTAGETEST.ino
```

Use any available tool:

```bash
arduino-cli compile ...
```

or:

```bash
pio run
```

Report:

```text
tool used
board target
libraries installed
compile success/fail
errors if any
```

Do not say firmware complete without compile success.

---

## Step 21 — MQTT 1-Second Test

Hardware preferred.

If no hardware, use simulator and clearly state simulator-only.

Required:

- publish for 60 seconds
- seq increments
- interval around 1000 ms
- topic `ums/devices/{device_id}/data`
- payload includes all fields

Verification:

```text
Expected TelemetryRaw increase ≈ 60 rows
TelemetryLatest updated
worker logs show no errors
```

---

## Step 22 — Docker Integration Test

From deployment:

```bash
docker compose down -v --remove-orphans
docker compose config
docker compose up -d --build
docker compose ps
```

Required services:

```text
postgres healthy
mosquitto running
web healthy
mqtt-worker running
```

Check:

```bash
curl -f http://localhost:3000/api/health
```

Then publish 1 payload/sec for 30–60 sec to external Mosquitto.

Verify:

```text
mqtt-worker receives
TelemetryRaw count increases
TelemetryLatest updates
/api/telemetry/latest returns new fields
dashboard shows W/PF/kWh/Hz/VAR
/api/telemetry/history returns new fields
rollup writes Telemetry1m energy fields
```

---

## Step 23 — Final Tests

Run:

```bash
cd web-dashboard
npm run lint
npm run build
```

Then:

```text
Firmware compile
Docker compose
MQTT smoke
Latest API
History API
Rollup
Alarm rule
Session expiry
UI dashboard
UPS detail
```

---

## Step 24 — Final Report Format

Claude must return exactly:

```text
Branch:
Commit:
Files changed:

Firmware:
- compile:
- hardware tested yes/no:
- MQTT interval proof:
- MQTT topic:
- sample payload:
- real fields:
- null/unsupported fields:
- calibration status:

Backend:
- migrations:
- worker mapping:
- latest API fields:
- history API fields:
- rollup fields:
- kWh LAST test:

UI:
- dashboard fields visible:
- UPS detail fields visible:
- settings limitation text:
- null handling:

Alarms:
- new metrics selectable:
- pf_out rule test:
- alarm create/clear test:

Docker/MQTT:
- compose:
- external MQTT:
- TelemetryRaw rows:
- TelemetryLatest:
- dashboard:

Tests:
- npm run lint:
- npm run build:
- firmware compile:
- docker compose:
- MQTT 1-second:
- API latest:
- API history:
- rollup:
- alarm rule:

Remaining limitations:
Ship decision:
```

Ship decision rules:

```text
If firmware does not compile: FAIL
If MQTT is not 1 second: FAIL
If UI does not receive new fields: FAIL
If Docker worker cannot ingest new topic: FAIL
If energy values are fake RMS estimates: FAIL
If only simulator tested: mark as simulator-certified, not hardware-certified
```

---

## Expected End State

The project is complete only when:

```text
1. Firmware publishes every second.
2. Firmware publishes real/valid W, PF, kWh, Hz, VAR or null.
3. Docker worker stores all fields.
4. Latest API returns all fields.
5. History API returns all fields.
6. Rollup stores correct W/PF/Q/Hz and kWh LAST.
7. Dashboard and UPS detail show all parameters.
8. Alarm rules can evaluate new parameters.
9. Docker external MQTT smoke test passes.
10. Firmware compile passes.
```
