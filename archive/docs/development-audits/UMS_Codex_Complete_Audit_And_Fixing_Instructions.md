# UMS / VOLTAGETEST â€” Complete Repo Audit + Codex Fixing Instructions

**Uploaded ZIP audited:** `VOLTAGETEST-energy-analyzer-integration (1).zip`
**Extracted path used for audit:** `/mnt/data/repo_audit_current/VOLTAGETEST-energy-analyzer-integration`
**Target branch expected:** `energy-analyzer-integration`
**Prepared for:** Codex / next coding assistant
**Purpose:** Finish cleanup, fix remaining blockers, produce verifiable release evidence, and prepare for merge/tag only after gates pass.

---

## 0. Executive decision

```text
Current decision: FAIL for final release / FAIL for merge-tag
```

The repo is much cleaner than older packages, but it still has real issues:

1. `npm run lint` fails on the latest uploaded repo.
2. `npm run build` is not independently certified here because Prisma Client generation failed in this sandbox due DNS.
3. Multiple active release/handover docs still contain old firmware v0.5.2, `firmware/ups_monitor`, old MQTT topic, and incorrect W/PF/kWh limitations.
4. Runtime proof logs are missing from the repo/package.
5. Screenshots show offline/demo state, not live telemetry.
6. Live board proof is still missing.
7. Production secret validation is not strict enough.
8. UI still exposes board config push controls even though the API returns 501 in Docker/external broker mode.
9. Firmware still has unsafe/local defaults (`Rao`, `password123`, public HiveMQ) that need either safer defaults or strong commissioning documentation.

Do **not** merge or tag until all P0 items below are resolved and verified.

---

# 1. Commands actually run

## 1.1 ZIP extract

```bash
rm -rf /mnt/data/repo_audit_current
mkdir -p /mnt/data/repo_audit_current
unzip -q "/mnt/data/VOLTAGETEST-energy-analyzer-integration (1).zip" -d /mnt/data/repo_audit_current
```

**Result:** PASS

Extracted folder:

```text
/mnt/data/repo_audit_current/VOLTAGETEST-energy-analyzer-integration
```

---

## 1.2 Package hygiene inspection

Command:

```bash
python3 - <<'PY'
import zipfile,re
zp='/mnt/data/VOLTAGETEST-energy-analyzer-integration (1).zip'
rx=re.compile(r'(^|/|\\)(\.env$|CREDENTIALS\.md$|passwords$)|backups|node_modules|\.next|playwright-report|test-results|\.log$|\.err\.log$|\.elf$|\.map$|tsconfig\.tsbuildinfo|firmware[/\\].*[/\\]build')
with zipfile.ZipFile(zp) as z:
    m=[n for n in z.namelist() if rx.search(n)]
    print(len(m))
    print('\n'.join(m[:20]))
PY
```

**Result:** PASS

```text
0 matches
```

The uploaded ZIP is clean from the previous major packaging problems:
- no `.env`
- no `CREDENTIALS.md`
- no Mosquitto password file
- no backups
- no `node_modules`
- no `.next`
- no test reports
- no firmware build folders
- no `.elf`/`.map`

---

## 1.3 NPM install

Command:

```bash
cd web-dashboard
npm ci --ignore-scripts --no-audit --progress=false
```

**Result:** PASS

Output summary:

```text
added 443 packages in 28s
```

---

## 1.4 ESLint

Command:

```bash
npm run lint
```

**Result:** FAIL

Errors:

```text
web-dashboard/src/app/admin/inventory/page.tsx
  200:21  error  react-hooks/set-state-in-effect

web-dashboard/src/app/admin/settings/page.tsx
  221:5   error  react-hooks/set-state-in-effect

web-dashboard/src/app/admin/settings/page.tsx
  172:83  warning  unused eslint-disable
  210:18  warning  unused eslint-disable
  224:77  warning  unused eslint-disable

web-dashboard/src/app/alarms/page.tsx
  221:59  warning  unused eslint-disable

web-dashboard/src/app/api/settings/route.ts
  2:10  warning  requireApiAuth unused
```

This directly contradicts any claim that the current uploaded repo has `0 lint errors`.

---

## 1.5 Prisma generate

Command:

```bash
npm run db:generate
```

**Result:** FAIL in this sandbox

Error:

```text
request to https://binaries.prisma.sh/.../libquery_engine.so.node.gz.sha256 failed,
reason: getaddrinfo EAI_AGAIN binaries.prisma.sh
```

This is likely sandbox DNS/network limitation. Codex must rerun this in an environment with internet access.

---

## 1.6 Next build

Command:

```bash
npm run build
```

**Result:** FAIL / not certified here

Observed:

```text
âœ“ Compiled successfully in 17.2s
Running TypeScript ...
Failed to type check.

./instrumentation.ts:13:10
Type error: Module '"@prisma/client"' has no exported member 'PrismaClient'.
```

This is caused by Prisma Client not being generated. Codex must rerun after successful `npm run db:generate`.

---

## 1.7 TypeScript check

Command:

```bash
npx tsc --noEmit
```

**Result:** FAIL due missing generated Prisma Client.

Do not treat these as final code errors until Prisma generation succeeds. But build cannot be certified until they pass.

---

## 1.8 Playwright

Command:

```bash
npx playwright test --reporter=line
```

**Result:** FAIL in this sandbox because Chromium is missing.

Error:

```text
browserType.launch: Executable doesn't exist ...
Please run: npx playwright install
```

Codex must run Playwright in an environment where Chromium is installed.

---

## 1.9 Shell syntax

Commands:

```bash
bash -n deployment/certify.sh
bash -n deployment/mosquitto/setup-passwords.sh
bash -n deployment/scripts/backup.sh
bash -n deployment/scripts/restore.sh
bash -n deployment/scripts/health-check.sh
```

**Result:** PASS

---

## 1.10 NPM production security audit

Command:

```bash
npm audit --omit=dev --json
```

**Result:** FAIL exit code due vulnerabilities.

Summary:

```text
5 moderate vulnerabilities
0 high
0 critical
```

Vulnerable chains:

```text
next -> postcss
aedes -> hyperid -> uuid
```

This may be acceptable to defer only if `docs/SECURITY_AUDIT.md` documents exact risk and upgrade plan.

---

# 2. What is completed / improved

## 2.1 Package hygiene

Completed:

```text
No .env files
No CREDENTIALS.md
No Mosquitto password file
No database backups
No node_modules
No .next
No test-results/playwright-report
No firmware build folders
No .elf/.map artifacts
```

## 2.2 Firmware source structure

Completed:

```text
Active canonical firmware:
firmware/VOLTAGETEST/VOLTAGETEST.ino

Legacy firmware:
archive/firmware/ups_monitor_legacy/ups_monitor.ino

Root VOLTAGETEST.ino:
removed
```

## 2.3 Active MQTT topic

Completed in active code:

```text
Device topic:
ums/devices/{device_id}/data

Worker topic:
ums/devices/+/data
```

Verified in:

```text
deployment/docker-compose.yml
deployment/.env.example
web-dashboard/.env.example
release/dashboard/.env.production.example
worker/mqtt-worker.ts
deployment/mosquitto/acl.example
```

## 2.4 Firmware v1.0.0 features present

Verified in source:

```text
FIRMWARE_VERSION "1.0.0"
MQTT_PUBLISH_MS 1000UL
/api/info endpoint
/data endpoint
/update OTA endpoint
/calib endpoint
/resetenergy endpoint
MQTT username/password support
MQTT port support
firmware field in payload
energy fields in payload
password inputs no longer display stored password
blank WiFi/MQTT password submit preserves existing password
```

## 2.5 Backend energy path mostly wired

Verified in source:

```text
worker stores pInW/pOutW/pfIn/pfOut/freqIn/freqOut/qInVar/qOutVar/eInKwh/eOutKwh
latest API returns energy fields
history API returns energy fields
Telemetry1m rollup has energy fields
UPS detail volt_dc pass-through is fixed
alarm engine receives energy fields from external worker
```

---

# 3. P0 blockers â€” must fix before merge/tag

## P0-1 â€” ESLint fails

### Evidence

`npm run lint` fails.

Files:

```text
web-dashboard/src/app/admin/inventory/page.tsx
web-dashboard/src/app/admin/settings/page.tsx
web-dashboard/src/app/api/settings/route.ts
```

### Required fixes

#### `admin/inventory/page.tsx`

Current:

```ts
const [userRole, setUserRole] = useState<UserRole>("viewer");
useEffect(() => { setUserRole(readRole()); }, []);
```

Fix without synchronous state in effect. Options:

Preferred:

```ts
const [userRole] = useState<UserRole>(() => readRole());
```

or if SSR/browser issue exists:

```ts
const canEdit = typeof document !== "undefined"
  ? ["admin", "manufacturer"].includes(readRole())
  : false;
```

Use the cleanest pattern that does not violate lint.

#### `admin/settings/page.tsx`

Current problem:

```ts
useEffect(() => {
  setBrokerLoading(true);
  fetch(...)
    .finally(() => setBrokerLoading(false));
}, []);
```

React lint flags direct setState in effect. Use one of:

- initialize loading as `true` and remove initial `setBrokerLoading(true)`, or
- wrap async loader in function and only set state after await/callback, or
- use a reducer if needed.

Also remove unused `eslint-disable-line` comments.

#### `api/settings/route.ts`

Remove unused import:

```ts
requireApiAuth
```

### Required verification

```bash
cd web-dashboard
npm run lint
```

Expected:

```text
0 errors
0 warnings
```

---

## P0-2 â€” Build not certified from this ZIP

### Evidence

`npm run db:generate` failed here due DNS to `binaries.prisma.sh`.

`npm run build` then failed because generated Prisma Client was unavailable.

### Required Codex action

In an environment with internet access:

```bash
cd web-dashboard
rm -rf node_modules .next
npm ci
npm run db:generate
npm run lint
npm run build
```

Capture logs:

```text
docs/audit/logs/2026-05-25/npm-ci.log
docs/audit/logs/2026-05-25/db-generate.log
docs/audit/logs/2026-05-25/lint.log
docs/audit/logs/2026-05-25/npm-run-build.log
```

### Required pass

```text
npm run lint: 0 errors, 0 warnings
npm run build: completed successfully
```

Do not claim build pass without raw logs.

---

## P0-3 â€” Active release/handover docs are stale and contradictory

### Evidence

Grep command:

```bash
grep -RInE 'building/\+/ups|building/.*/ups|UPSMON|ups_monitor|v0\.5\.2|not supported|not computed|future hardware|Active power.*not|W/PF/kWh|energy-analyzer-v1\.0|5 seconds|0\.5\.2' . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=.next \
  --exclude-dir=archive \
  --exclude-dir=test-results \
  --exclude-dir=playwright-report
```

Important stale active files still found:

```text
RELEASE_NOTES.md
docs/CALIBRATION_GUIDE.md
docs/COMMISSIONING_GUIDE.md
docs/FIRMWARE_LIMITATIONS.md
docs/IMPLEMENTATION_STATUS.md
firmware/README.md
release/UMS_FIELD_TEST_REPORT_TEMPLATE.md
release/UMS_INSTALLER_CHECKLIST.md
release/UMS_OPERATOR_GUIDE.md
release/UMS_RELEASE_NOTES.md
web-dashboard/scripts/audit-screenshots.ts
```

### Concrete examples

`release/UMS_INSTALLER_CHECKLIST.md` still says:

```text
Version: firmware v0.5.2
Obtained firmware binary ups_monitor_v0.5.2.bin
arduino-cli upload ... firmware/ups_monitor
Starting UMS firmware v0.5.2
Topic: building/<site-id>/ups/<device-id>/telemetry
Publish interval 5 seconds
firmware: 0.5.2 confirmed
```

`release/UMS_OPERATOR_GUIDE.md` still says:

```text
Version: firmware v0.5.2 / Dashboard r01a50b5
Verify MQTT topic matches building/+/ups/+/telemetry
```

`docs/FIRMWARE_LIMITATIONS.md` still says:

```text
Active Power, Power Factor, Energy (kWh) â€” Not Available
Fields p_in_w, p_out_w, pf_in, pf_out, e_in_kwh, e_out_kwh are always null
A new TCP connection + MQTT CONNECT is opened every publish cycle (default 10 s)
```

But firmware source says:

```text
MQTT_PUBLISH_MS 1000UL
Real power via instantaneous VÃ—I
PF calculation
Q calculation
Energy integration
Fields can publish numeric values or null depending signal/calibration
```

`firmware/README.md` payload example still says:

```json
"firmware": "energy-analyzer-v1.0"
```

Correct value is:

```json
"firmware": "1.0.0"
```

### Required fix

Do not add warning banners only. Rewrite or archive stale docs.

Current truth must be consistent everywhere:

```text
Firmware version: v1.0.0
Canonical source: firmware/VOLTAGETEST/VOLTAGETEST.ino
Official OTA binary: release/firmware/v1.0.0/VOLTAGETEST-v1.0.0.merged.bin
Device MQTT topic: ums/devices/{device_id}/data
Worker MQTT topic: ums/devices/+/data
Publish interval: 1 second
W/PF/kWh/Q/Hz are implemented in firmware code
Accuracy requires reference-meter calibration
Phase correction is stored but not applied
Invalid/unavailable fields publish null
Legacy firmware/docs are archived only
```

### Required action by file

#### `release/UMS_INSTALLER_CHECKLIST.md`

Rewrite for v1.0.0:

- use `firmware/VOLTAGETEST/VOLTAGETEST.ino`
- use `release/firmware/v1.0.0/VOLTAGETEST-v1.0.0.merged.bin`
- use topic `ums/devices/<device_id>/data`
- publish interval `1 second`
- verify `/api/info`
- verify `/data`
- verify `mqtt_auth=true`
- verify dashboard online
- verify LAN scan

#### `release/UMS_OPERATOR_GUIDE.md`

Rewrite:

- remove v0.5.2
- remove old topic
- explain W/PF/kWh/Q/Hz UI behavior
- explain `â€”` / `Not available` means null/unavailable/calibration pending
- explain offline status and last seen

#### `docs/FIRMWARE_LIMITATIONS.md`

Rewrite:

- do not say W/PF/kWh always null
- state implementation vs accuracy certification
- keep true limitations:
  - phase correction stored but not applied
  - Q sign unsigned
  - kWh NVS save interval up to 60s loss
  - command/config MQTT subscription not supported
  - real accuracy requires reference meter

#### `docs/CALIBRATION_GUIDE.md`

Rewrite calibration steps for:

- Vin scale/offset
- Vout scale/offset
- CT input/output scale/offset
- Vdc scale/offset
- frequency zero-cross offset
- W/PF validation with reference meter
- kWh drift check

Remove â€œcannot be calibrated: W/PF/kWh/Q not measured.â€

#### `firmware/README.md`

Correct:

```json
"firmware": "1.0.0"
```

and remove `energy-analyzer-v1.0`.

#### `RELEASE_NOTES.md`

Either rewrite as v1.0.0 or move old content to:

```text
archive/release/v0.2.0/RELEASE_NOTES.md
```

#### `docs/IMPLEMENTATION_STATUS.md`

If historical, move to archive or clearly mark as archived. Do not leave v0.5.2 sections as active implementation status.

### Required proof

After fixing, run:

```bash
grep -RInE 'building/\+/ups|building/.*/ups|firmware/ups_monitor|ups_monitor_v0\.5\.2|Starting UMS firmware v0\.5\.2|firmware: 0\.5\.2|energy-analyzer-v1\.0|Fields .*always null|Active Power.*Not Available|publish interval 5 seconds|default 10 s' \
  README.md RELEASE_NOTES.md docs firmware release web-dashboard \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=archive
```

Expected:

```text
No active release/handover matches.
```

Historical mentions are allowed only inside `archive/`.

---

## P0-4 â€” Runtime proof logs are missing

### Evidence

Repo contains screenshots but no logs:

```text
docs/audit/screenshots/2026-05-24/... exists
docs/audit/logs/... does not exist
```

### Required fix

Create:

```text
docs/audit/logs/2026-05-25/npm-ci.log
docs/audit/logs/2026-05-25/db-generate.log
docs/audit/logs/2026-05-25/lint.log
docs/audit/logs/2026-05-25/npm-run-build.log
docs/audit/logs/2026-05-25/playwright.log
docs/audit/logs/2026-05-25/docker-compose-ps.log
docs/audit/logs/2026-05-25/certify.log
docs/audit/logs/2026-05-25/db-cleanup-dry-run.log
```

If logs contain secrets, redact them.

`certify.log` must show:

```text
ALL CERTIFICATION STEPS PASSED
```

If Docker is not available, say so and keep ship decision as FAIL or PASS WITH CONDITIONS depending what remains.

---

## P0-5 â€” Screenshots are offline/demo only

### Evidence

Current dashboard screenshot shows:

```text
Online: 0
Offline: 3
Live Out W: â€”
UPS-SMOKE-001
UPS-COM11-TEST
UPSMON-01
```

Boards screenshot shows:

```text
MQTT Connected: 0
LAN Discovered: 0
```

### Required fix

Label current screenshots as:

```text
offline/demo UI screenshots
```

Do not call them live telemetry proof.

Add future live-board screenshot folder:

```text
docs/audit/screenshots/2026-05-25-live-board/
```

Required live-board screenshots after on-site proof:

```text
Dashboard Online >= 1
Boards MQTT Connected >= 1
LAN Scan result showing UMS-3076F5A5AD54
UPS detail with firmware 1.0.0 and live values
Board /api/info
Board /data
```

---

## P0-6 â€” Live board proof still missing

### Required proof

On the actual site/network:

```bash
curl -s http://192.168.0.100/api/info | jq .
curl -s http://192.168.0.100/data | jq .
```

Expected:

```text
device_id = UMS-3076F5A5AD54
firmware = 1.0.0
mqtt_host = local broker/server
mqtt_port = 1883
mqtt_auth = true
mqtt_topic = ums/devices/UMS-3076F5A5AD54/data
```

Then dashboard must show:

```text
Online >= 1
UMS-3076F5A5AD54 visible
lastSeenAt recent
firmware 1.0.0
live voltage/current/W/PF/Hz/kWh fields or null where unavailable
```

Boards page must show:

```text
LAN Scan discovers board
MQTT Connected >= 1
```

If board is unreachable, final ship decision cannot be PASS. It can only be PASS WITH CONDITIONS at best.

---

## P0-7 â€” Production auth/secrets startup hardening still incomplete

### Evidence

`web-dashboard/instrumentation.ts` throws for some exact placeholders, but only logs errors for missing production auth:

```ts
if (!process.env.UPS_AUTH_TOKEN) {
  console.error("[auth] FATAL: UPS_AUTH_TOKEN not set â€” login blocked in production.");
}
if (!process.env.UPS_AUTH_PASSWORD_HASH && !process.env.UPS_AUTH_PASSWORD) {
  console.error("[auth] FATAL: No password configured â€” login blocked in production.");
}
```

Also placeholder list is incomplete compared with:

```text
web-dashboard/.env.example
deployment/.env.example
release/dashboard/.env.production.example
deployment/docker-compose.yml defaults
```

### Required fix

In `NODE_ENV=production`:

1. Throw if `UPS_AUTH_TOKEN` is missing.
2. Throw if `UPS_AUTH_PASSWORD_HASH` is missing.
3. Do not allow plaintext `UPS_AUTH_PASSWORD` in production.
4. Throw if `DATABASE_URL` is missing.
5. Throw if `MQTT_PASSWORD` is missing when `MQTT_USERNAME` is set.
6. Expand placeholder detection to cover all actual placeholders:
   - `replace-with-a-long-random-session-token`
   - `replace-with-a-64-char-hex-string-generated-by-crypto-randomBytes`
   - `replace-with-64-char-hex`
   - `REPLACE_WITH_64_CHAR_HEX_FROM_crypto_randomBytes_32`
   - `change-this-db-password`
   - `change-this-strong-random-password`
   - `CHANGE_THIS_DB_PASSWORD`
   - `change-this-mqtt-password`
   - `change-this-strong-mqtt-password`
   - `CHANGE_THIS_MQTT_PASSWORD`
   - `replacethiswithyourrealbcrypthash`
   - `REPLACE_THIS_WITH_YOUR_REAL_BCRYPT_HASH`

### Docker compose issue

`deployment/docker-compose.yml` still has insecure defaults:

```yaml
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-change-this-db-password}
UPS_AUTH_TOKEN: ${UPS_AUTH_TOKEN:-replace-with-a-long-random-session-token}
MQTT_PASSWORD: ${MQTT_PASSWORD:-change-this-mqtt-password}
```

For production compose, fail fast instead of defaulting to placeholders.

Recommended:

```yaml
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD}
UPS_AUTH_TOKEN: ${UPS_AUTH_TOKEN:?Set UPS_AUTH_TOKEN}
MQTT_PASSWORD: ${MQTT_PASSWORD:?Set MQTT_PASSWORD}
```

Do the same for `DATABASE_URL` parts if possible.

---

## P0-8 â€” Board config push UI is misleading

### Evidence

`/api/devices/[deviceId]/config` returns `501` in external broker mode:

```text
Config push via MQTT is not available in external-broker mode.
Firmware does not yet subscribe to config topics.
```

But `web-dashboard/src/app/admin/settings/page.tsx` still shows:

```text
Push New Configuration
Push Config to Board
```

This is misleading for manufacturer/admin users.

### Required fix

If `ENABLE_EMBEDDED_BROKER=false` or backend reports config push unsupported:

- disable the â€œPush Config to Boardâ€ button,
- show clear banner:
  ```text
  Remote config push is not supported in production firmware v1.0.0. Use the board local web UI at http://<device-ip>/.
  ```
- do not imply push will work.

Better: expose capability from API:

```text
GET /api/system/features
configPushSupported: false
commandSubscriptionSupported: false
```

or hardcode in settings page for now.

---

## P0-9 â€” Firmware default credentials / public broker defaults are unsafe

### Evidence

`firmware/VOLTAGETEST/VOLTAGETEST.ino`:

```cpp
#define DEFAULT_WIFI_SSID   "Rao"
#define DEFAULT_WIFI_PASS   "password123"
#define AP_PASS             "password123"
#define MQTT_HOST_DEFAULT   "broker.hivemq.com"
```

### Risk

If an installer flashes without changing settings, the board may:
- try to join the wrong SSID,
- use weak default password,
- expose setup AP with known password,
- publish to public HiveMQ instead of the local broker.

### Required fix options

Preferred production-safe defaults:

```cpp
#define DEFAULT_WIFI_SSID   ""
#define DEFAULT_WIFI_PASS   ""
#define AP_PASS             "UMSSetup2026"   // or generated/documented secure value
#define MQTT_HOST_DEFAULT   "ums-server.local"
```

Also add local portal warning if MQTT host is public HiveMQ:

```text
Public test broker selected â€” not production safe.
```

If you keep the current defaults for lab convenience, document them as lab-only and block release builds from using them.

Recommended compile guard:

```cpp
#ifndef UMS_PRODUCTION_BUILD
// lab defaults allowed
#else
// require blank WiFi and local broker default
#endif
```

---

## P0-10 â€” Docker certification not independently proved in package

### Evidence

`UMS_AUDIT_RESPONSE_REPORT_2026-05-24.md` claims all steps passed, but no raw log exists in the ZIP.

### Required fix

Add `docs/audit/logs/2026-05-25/certify.log`.

It must include:
- fresh `docker compose down -v`
- `docker compose up -d --build`
- all 13 certification steps
- final `ALL CERTIFICATION STEPS PASSED`

---

# 4. P1 issues â€” fix before customer handover

## P1-1 â€” Development-only prompt/audit docs remain in release package

Root contains:

```text
UMS_Final_Fixing_Plan.md
UMS_Cleanup_QA_Guide_For_Claude.md
UMS_Energy_Analyzer_Integration_Audit_Report.md
UMS_Audit_Closure_Report.md
```

These are useful internally, but they confuse a customer/site package.

### Fix

Move to:

```text
archive/docs/development-audits/
```

or exclude from customer release package.

Keep current release docs only in:

```text
docs/
release/
```

---

## P1-2 â€” Duplicate screenshot copies

Screenshots exist in both:

```text
docs/audit/screenshots/2026-05-24/
web-dashboard/qa/screenshots/
```

This is not fatal, but bloats source and can get stale.

### Fix

Use one source of truth.

Recommended:
- keep committed evidence in `docs/audit/screenshots/...`
- keep generated working screenshots under `web-dashboard/qa/screenshots/` but gitignore them
- do not package both

---

## P1-3 â€” In-process telemetry worker is a maintenance risk

`web-dashboard/src/lib/telemetry-worker.ts` now mostly aligns with external worker, but it still maintains a separate normalization path. Production uses external `worker/mqtt-worker.ts`.

### Fix

Either:
1. keep it and add tests proving both workers normalize v1.0.0 payloads identically, or
2. remove/disable in-process worker from production docs and clearly mark it dev-only.

---

## P1-4 â€” Security audit needs final upgrade plan

Current vulnerabilities:

```text
next -> postcss
aedes -> hyperid -> uuid
```

If deferring:
- state runtime exposure,
- state why safe for current deployment,
- state target version and future sprint.

---

## P1-5 â€” DB cleanup dry run still required on target DB

Cleanup script includes test devices, but dry run was not executed here.

Run on target DB only:

```bash
cd web-dashboard
npm run db:cleanup-test:dry
```

Save output to:

```text
docs/audit/logs/2026-05-25/db-cleanup-dry-run.log
```

Do not actual delete until user approves.

---

# 5. Codex fixing instructions â€” all in one prompt

Send this complete instruction to Codex.

```text
You are working on the UMS / VOLTAGETEST repo.

Branch:
energy-analyzer-integration

Do not merge.
Do not tag.
Do not add new features.
Fix only audit blockers and produce proof.

First run:

git status --short
git branch --show-current
git rev-parse --short HEAD
git log --oneline -5

Then work through the following in order.

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
A. Fix lint failures â€” P0
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Run:

cd web-dashboard
npm ci
npm run lint

Fix the current lint errors:

1. web-dashboard/src/app/admin/inventory/page.tsx
   - Replace:
     useEffect(() => { setUserRole(readRole()); }, []);
   - Preferred:
     const [userRole] = useState<UserRole>(() => readRole());
   - Or another lint-safe pattern.

2. web-dashboard/src/app/admin/settings/page.tsx
   - Remove direct synchronous setBrokerLoading(true) inside useEffect.
   - Initialize brokerLoading as true if needed and only set false after request.
   - Remove unused eslint-disable-line comments.
   - Keep behavior unchanged.

3. web-dashboard/src/app/api/settings/route.ts
   - Remove unused requireApiAuth import.

Pass condition:

npm run lint
# 0 errors, 0 warnings

Save log:

docs/audit/logs/2026-05-25/lint.log

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
B. Certify build from clean install â€” P0
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Run:

cd web-dashboard
rm -rf node_modules .next
npm ci
npm run db:generate
npm run lint
npm run build

Save logs:

docs/audit/logs/2026-05-25/npm-ci.log
docs/audit/logs/2026-05-25/db-generate.log
docs/audit/logs/2026-05-25/npm-run-build.log

Pass condition:
Next build completes successfully.

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
C. Rewrite stale release docs â€” P0
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Run grep:

grep -RInE 'building/\+/ups|building/.*/ups|firmware/ups_monitor|ups_monitor_v0\.5\.2|Starting UMS firmware v0\.5\.2|firmware: 0\.5\.2|energy-analyzer-v1\.0|Fields .*always null|Active Power.*Not Available|publish interval 5 seconds|default 10 s|firmware v0\.5\.2|Version: firmware v0\.5\.2' \
  README.md RELEASE_NOTES.md docs firmware release web-dashboard \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=archive

Rewrite or archive every active stale result.

Fix these especially:

- release/UMS_INSTALLER_CHECKLIST.md
- release/UMS_OPERATOR_GUIDE.md
- release/UMS_FIELD_TEST_REPORT_TEMPLATE.md
- release/UMS_RELEASE_NOTES.md if stale sections are active
- RELEASE_NOTES.md
- docs/CALIBRATION_GUIDE.md
- docs/FIRMWARE_LIMITATIONS.md
- docs/IMPLEMENTATION_STATUS.md if active
- docs/COMMISSIONING_GUIDE.md if 5-sec/default legacy text remains
- firmware/README.md

Current truth to use everywhere:

Firmware: v1.0.0
Canonical source: firmware/VOLTAGETEST/VOLTAGETEST.ino
OTA binary: release/firmware/v1.0.0/VOLTAGETEST-v1.0.0.merged.bin
Device MQTT topic: ums/devices/{device_id}/data
Worker MQTT topic: ums/devices/+/data
Publish interval: 1 second
W/PF/kWh/Q/Hz are implemented by firmware code
Accuracy requires reference-meter calibration
Phase correction is stored but not applied
Reactive power sign is unsigned
Invalid/unavailable values publish null
Legacy firmware/docs are archived only

Important:
Do not just add banners saying "old guide".
Customer-facing release docs must be usable and correct for v1.0.0.

Save grep proof after fixing:

docs/audit/logs/2026-05-25/stale-docs-grep.log

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
D. Add raw test and certification logs â€” P0
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Create:

docs/audit/logs/2026-05-25/

Capture:

npm run lint
npm run build
npx playwright test
docker compose ps
bash certify.sh
npm run db:cleanup-test:dry

Required files:

docs/audit/logs/2026-05-25/lint.log
docs/audit/logs/2026-05-25/npm-run-build.log
docs/audit/logs/2026-05-25/playwright.log
docs/audit/logs/2026-05-25/docker-compose-ps.log
docs/audit/logs/2026-05-25/certify.log
docs/audit/logs/2026-05-25/db-cleanup-dry-run.log

Redact secrets from logs.

certify.log must include:

ALL CERTIFICATION STEPS PASSED

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
E. Run full Docker certification â€” P0
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

From repo root:

cd deployment
docker compose down -v --remove-orphans
docker compose config
docker compose up -d --build
CERT_ADMIN_PASSWORD=<actual-test-admin-password> bash certify.sh

Do not stop at /api/health.
The script has 13 steps. All must pass.

Save:

docs/audit/logs/2026-05-25/docker-compose-ps.log
docs/audit/logs/2026-05-25/certify.log

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
F. Fix production auth/secret hardening â€” P0
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

File:
web-dashboard/instrumentation.ts

In NODE_ENV=production:

- Throw Error if UPS_AUTH_TOKEN missing.
- Throw Error if UPS_AUTH_PASSWORD_HASH missing.
- Do not allow plain UPS_AUTH_PASSWORD in production.
- Throw if DATABASE_URL missing.
- If MQTT_USERNAME is set, MQTT_PASSWORD must be set.
- Throw on all placeholder values used in:
  web-dashboard/.env.example
  deployment/.env.example
  release/dashboard/.env.production.example
  deployment/docker-compose.yml

Include these placeholder values:

replace-with-a-long-random-session-token
replace-with-a-64-char-hex-string-generated-by-crypto-randomBytes
replace-with-64-char-hex
REPLACE_WITH_64_CHAR_HEX_FROM_crypto_randomBytes_32
change-this-db-password
change-this-strong-random-password
CHANGE_THIS_DB_PASSWORD
change-this-mqtt-password
change-this-strong-mqtt-password
CHANGE_THIS_MQTT_PASSWORD
replacethiswithyourrealbcrypthash
REPLACE_THIS_WITH_YOUR_REAL_BCRYPT_HASH

Also update deployment/docker-compose.yml:
Do not silently default production secrets to placeholder values.
Use required env syntax where possible:

${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD}
${UPS_AUTH_TOKEN:?Set UPS_AUTH_TOKEN}
${MQTT_PASSWORD:?Set MQTT_PASSWORD}

Update docs accordingly.

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
G. Fix misleading config push UI â€” P0
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Problem:
API route /api/devices/[deviceId]/config returns 501 in external broker mode.
Firmware v1.0.0 does not subscribe to config topics.
But Settings UI still shows "Push Config to Board".

Fix:
- Disable or hide "Push Config to Board" unless config push is truly supported.
- Show a clear warning:
  "Remote config push is not supported in firmware v1.0.0 / production external-broker mode. Use the board local web UI at http://<device-ip>/."
- If button remains, it must be visibly disabled and not imply success.
- Update docs.

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
H. Harden firmware defaults â€” P0/P1
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

File:
firmware/VOLTAGETEST/VOLTAGETEST.ino

Current lab defaults:
DEFAULT_WIFI_SSID "Rao"
DEFAULT_WIFI_PASS "password123"
AP_PASS "password123"
MQTT_HOST_DEFAULT "broker.hivemq.com"

Fix for production:
Option 1, preferred:
- DEFAULT_WIFI_SSID ""
- DEFAULT_WIFI_PASS ""
- AP_PASS "UMSSetup2026" or documented strong setup password
- MQTT_HOST_DEFAULT "ums-server.local"

Option 2:
- Keep lab defaults only behind non-production compile flag.
- Document that production build must not use lab defaults.

Also add visible portal warning when MQTT host is broker.hivemq.com:
"Public test broker selected â€” not production safe."

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
I. Screenshots and live-board proof â€” P0/P1
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Current screenshots are offline/demo UI only. Keep them but label them correctly.

Add docs note:
docs/audit/screenshots/2026-05-24/README.md

Say:
"These screenshots prove UI render/layout only. They do not prove live board telemetry."

When board is reachable, capture new set:

docs/audit/screenshots/2026-05-25-live-board/

Required:
- dashboard Online >= 1
- Boards MQTT Connected >= 1
- LAN Scan result showing UMS-3076F5A5AD54
- UPS detail live values
- board /api/info
- board /data

If unreachable, final ship decision remains PASS WITH CONDITIONS maximum.

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
J. DB cleanup dry-run â€” P1
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Run on target DB only:

cd web-dashboard
npm run db:cleanup-test:dry

Save:
docs/audit/logs/2026-05-25/db-cleanup-dry-run.log

Do not run actual cleanup until user approval.

Protect:
UMS-3076F5A5AD54

Cleanup candidates:
DOCKER-SMOKE-001
DEV-COM11-TEST
TEST-DEVICE
TEST-DEVICE-DUMMY
UPS-SMOKE-001
SMOKE-TEST-001
UPS-COM11-TEST
old ACK comments: 099, kk, test, runtime certification ack

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
K. Security audit â€” P1
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Run:

cd web-dashboard
npm audit --omit=dev --json

Update:
docs/SECURITY_AUDIT.md

Include:
- exact current vulnerabilities
- runtime exposure decision
- dev-only vs production
- upgrade plan and target versions
- reason if deferred

Current known chains:
next -> postcss
aedes -> hyperid -> uuid

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
L. Archive internal audit-prompt docs â€” P1
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Move internal prompt/audit working files to:

archive/docs/development-audits/

Candidates:
UMS_Final_Fixing_Plan.md
UMS_Cleanup_QA_Guide_For_Claude.md
UMS_Energy_Analyzer_Integration_Audit_Report.md
UMS_Audit_Closure_Report.md

Customer/source package should not expose internal Claude/Codex process files unless intentionally included as development history.

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
M. Final clean package â€” P0
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Create from Git, not from working directory:

git archive --format=zip --output VOLTAGETEST-v1.0.0-source-clean.zip HEAD

Inspect:

unzip -l VOLTAGETEST-v1.0.0-source-clean.zip | grep -E '\.env$|CREDENTIALS|passwords$|backups|node_modules|\.next|playwright-report|test-results|\.err\.log$|\.elf$|\.map$|tsconfig.tsbuildinfo|firmware/.*/build'

Expected:
No matches, except intentionally committed redacted docs/audit/*.log if allowed.

â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
N. Final report required
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Return exactly:

Branch:
Commit before:
Commit after:

Tests:
- npm ci:
- db generate:
- lint:
- build:
- Playwright:
- Docker compose:
- certify.sh:
- npm audit:

P0 fixes:
- lint:
- stale docs:
- proof logs:
- auth hardening:
- config push UI:
- firmware defaults:
- live board proof:
- clean package:

Docs:
- release installer guide:
- operator guide:
- firmware limitations:
- calibration guide:
- firmware README:
- release notes:

Evidence:
- logs path:
- screenshots path:
- stale docs grep path:
- clean zip inspection result:
- board proof:

Remaining:
- physical reference-meter calibration:
- on-site board credential/config:
- any other known limitation:

Ship decision:
FAIL / PASS WITH CONDITIONS / PASS

Rules:
- FAIL if lint/build/certify/docs cleanup are missing.
- PASS WITH CONDITIONS only if code, docs, Docker, and package are clean and only on-site board proof/calibration remains.
- PASS only after live board proof and calibration are complete.
```

---

# 6. Acceptance checklist

Before merge/tag, all must be true:

```text
[ ] npm run lint passes with 0 errors and 0 warnings
[ ] npm run build passes
[ ] npx playwright test passes
[ ] docker certify.sh passes all 13 steps
[ ] release docs no longer instruct old firmware/topic
[ ] firmware docs show firmware=1.0.0
[ ] FIRMWARE_LIMITATIONS does not falsely say W/PF/kWh always null
[ ] screenshots are correctly labelled offline/demo or live-board
[ ] live board proof is attached or release decision is PASS WITH CONDITIONS only
[ ] production auth throws on missing/placeholder secrets
[ ] config push UI is disabled/clear when unsupported
[ ] firmware production defaults are safe or guarded
[ ] clean git archive has no secrets/build artifacts
[ ] DB cleanup dry run is reviewed
```

---

# 7. Current final judgement

```text
Repo is improving and package is now clean, but it is not final-ready.
Main immediate blocker: lint fails.
Main handover blocker: release docs still stale/contradictory.
Main hardware blocker: no live board proof.
```

Do not merge or tag yet.
