# UMS / VOLTAGETEST — Release Audit + Offline Licensing Implementation Handover for Codex

**Input ZIP audited:** `VOLTAGETEST-energy-analyzer-integration(10).zip`  
**Audit folder:** `/mnt/data/retry_audit10/VOLTAGETEST-energy-analyzer-integration`  
**Target branch:** `energy-analyzer-integration`  
**Goal:** finish final release gates and implement reseller-safe offline per-UPS licensing.

---

## 1. Current release decision

```text
Do not merge.
Do not tag.
Do not give reseller/customer installer yet.
```

Current status:

```text
Technical codebase: much improved
Package hygiene: clean
Lint: pass
Old v0.5.2 docs grep: clean
Playwright evidence: 93 passed in included log
Docker certification: not proven
Live board proof: missing
Licensing: not implemented
```

Commercial reseller release is **not safe** until licensing exists.

---

## 2. What I verified from the latest ZIP

### 2.1 Package hygiene

Checked for:

```text
.env
CREDENTIALS.md
deployment/mosquitto/passwords
deployment/backups
node_modules
.next
playwright-report
test-results
firmware build folders
.elf / .map artifacts
```

Result:

```text
PASS
```

Only audit logs are present under:

```text
docs/audit/logs/2026-05-25/
```

Important: these logs are currently `.log` and UTF-16 PowerShell text. Root `.gitignore` ignores `*.log`. For final evidence, convert them to UTF-8 `.txt` or force-add them deliberately.

---

### 2.2 NPM install

Command:

```bash
cd web-dashboard
npm ci --ignore-scripts --no-audit --progress=false --prefer-offline
```

Result:

```text
PASS
443 packages installed
```

---

### 2.3 Lint

Command:

```bash
npm run lint
```

Result:

```text
PASS
No ESLint errors printed
```

Codex claim is correct.

---

### 2.4 Prisma generate

Command:

```bash
npm run db:generate
```

Result in my sandbox:

```text
FAIL due DNS to binaries.prisma.sh
```

This is sandbox network limitation. The repo includes Codex log saying it passed locally, but final proof must be generated on the actual build machine.

---

### 2.5 Build

The included build log shows build reached successful route output.

In my sandbox, build cannot be certified because Prisma engine download fails. Final release still needs UTF-8 build proof from Codex machine.

---

### 2.6 Stale old-doc grep

Command:

```bash
grep -RInE 'building/\+/ups|building/.*/ups|firmware/ups_monitor|ups_monitor_v0\.5\.2|Starting UMS firmware v0\.5\.2|firmware: 0\.5\.2|energy-analyzer-v1\.0|Fields .*always null|Active Power.*Not Available|publish interval 5 seconds|default 10 s|firmware v0\.5\.2|Version: firmware v0\.5\.2' \
  README.md RELEASE_NOTES.md docs firmware release web-dashboard \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=archive
```

Result:

```text
PASS
No active stale matches found
```

This previous blocker appears fixed.

---

### 2.7 Docker certification

Current included file:

```text
docs/audit/logs/2026-05-25/certify.log
```

It shows failure:

```text
WSL / bash / docker unavailable
```

So:

```text
Docker certification is still NOT passed.
```

Codex must run Docker certification on a real Linux/WSL/Docker host.

---

### 2.8 Live board proof

Still missing:

```text
http://192.168.0.100/api/info
http://192.168.0.100/data
dashboard Online >= 1
Boards MQTT Connected >= 1
LAN scan finds UMS board
```

This can remain a site condition, but final hardware release cannot be called PASS without it.

---

## 3. Current repo facts relevant for licensing

### Existing DB models

`web-dashboard/prisma/schema.prisma` has these important models:

```text
User
Site
UpsUnit
Device
TelemetryRaw
TelemetryLatest
Telemetry1m
Alarm
AlarmEvent
SystemSettings
DeviceDiscovered
MqttBroker
AuditLog
```

There is no license model yet.

---

### Existing UPS add/update/delete point

Main inventory endpoint:

```text
web-dashboard/src/app/api/inventory/route.ts
```

It currently allows:

```text
GET active UPS units
PUT bulk UPS upsert/reactivate
POST single UPS upsert/reactivate
DELETE soft-delete active=false
```

This is the most important licensing enforcement file.

---

### Existing device endpoint

```text
web-dashboard/src/app/api/devices/route.ts
```

Currently GET only. It lists active devices and assigned UPS.

There is no separate board assignment API yet. Device assignment happens through inventory POST/PUT when `deviceId` is provided.

---

### Existing config routes

There are two different config paths:

1. MQTT config push route:

```text
web-dashboard/src/app/api/devices/[deviceId]/config/route.ts
```

This returns `501` in external broker mode and is not production-ready.

2. Direct HTTP board config proxy:

```text
web-dashboard/src/app/api/board-config/route.ts
```

This posts to the board local `/save` endpoint. This can remain available to manufacturer/commissioning users if board IP is reachable.

Do not confuse these two.

---

### Existing config UI

```text
web-dashboard/src/app/admin/settings/page.tsx
```

It already shows a warning that remote MQTT config push is unsupported, but it still uses direct HTTP `/api/board-config` for board configuration. That is acceptable for commissioning.

For licensing, gate this under a feature such as:

```text
board_config
```

or keep manufacturer-only in V1.

---

### Existing app navigation

```text
web-dashboard/src/components/AppShell.tsx
```

Current nav items do not include License. Add:

```text
/admin/license
```

Minimum role:

```text
manufacturer
```

---

## 4. Licensing strategy to implement

Use:

```text
Signed offline license file/key
```

Do not build online activation server now.

Do not invent your own encoding algorithm.

Use:

```text
Ed25519 digital signature
```

Rule:

```text
Automatrix private key signs license.
UMS only has public key and verifies license.
Private key is never inside customer system.
```

This is secure enough because even an AI-assisted tool cannot generate a valid license without the private key, unless the customer has full source and removes enforcement. Therefore:

```text
Do not ship source code to resellers/customers.
Ship installer/images/binaries only.
```

---

## 5. Business rule

```text
1 active monitored UPS = 1 paid license seat
```

Not per user. Not per dashboard.

Example:

```text
License max_ups = 25
Active UPS = 25
Adding 26th UPS = blocked
```

Unlicensed boards may be discovered, but cannot become active monitored UPS without a free license seat.

---

## 6. License states

### No license

Recommended for reseller release:

```text
Activation required
No UPS can be added
Boards can be discovered
Admin/manufacturer can open /admin/license
```

Optional trial can be added later, but for first commercial release keep trial disabled:

```text
UMS_TRIAL_UPS_LIMIT=0
UMS_TRIAL_DAYS=0
```

### Active license

```text
Add UPS allowed until max_ups
Assign board/device allowed until max_ups
Features enabled by plan
```

### Limit reached

```text
Add UPS blocked
Assign new device to new UPS blocked
Existing licensed UPS continue working
```

### Expired but within grace

```text
Existing monitoring continues
Alarms continue
Warning banner visible
New UPS blocked
New board assignment blocked
Reports/export/OTA blocked or warned
```

### Expired after grace

```text
Live safety dashboard remains
Alarms remain
Add UPS blocked
Board assignment blocked
Reports/export blocked
Long history blocked
OTA blocked
Premium features blocked
```

Do not suddenly stop existing live monitoring. This is industrial equipment and can create safety/client dispute risk.

---

## 7. Machine Code

UMS must show a Machine Code.

Format:

```text
AMX-UMS-XXXX-XXXX-XXXX
```

Generate it from:

```text
persistent installation_id
host fingerprint
```

Do not use only Docker container ID.

For Docker/Linux, use:

```text
persistent installation_id in /app/data/license/installation-id
/etc/machine-id if accessible
DMI product UUID if accessible
primary MAC hash
hostname hash
optional env UMS_HOST_FINGERPRINT
```

Store and expose only the final Machine Code. Do not expose raw serials/MACs in API.

If server/PC changes, Automatrix issues a rehost license.

---

## 8. License format

Use one license envelope:

```json
{
  "alg": "Ed25519",
  "version": 1,
  "payload": "BASE64URL_OF_LICENSE_JSON",
  "signature": "BASE64URL_SIGNATURE_OF_PAYLOAD"
}
```

The payload should contain:

```json
{
  "license_id": "AMX-UMS-2026-0001",
  "customer": "Hadi Engineering",
  "reseller": "ABC Reseller",
  "site": "Factory Lahore",
  "plan": "pro",
  "max_ups": 25,
  "features": {
    "live_monitoring": true,
    "alarms": true,
    "energy_analyzer": true,
    "history": true,
    "reports": true,
    "ota": true,
    "multi_user": true,
    "multi_site": false,
    "white_label": false,
    "board_config": true
  },
  "valid_from": "2026-05-25",
  "valid_until": "2027-05-25",
  "grace_days": 30,
  "machine_code": "AMX-UMS-XXXX-XXXX-XXXX",
  "issued_at": "2026-05-25T10:00:00Z"
}
```

Use Base64URL payload because UMS verifies the exact payload string that was signed. This avoids JSON ordering/canonicalization problems.

---

## 9. Prisma models to add

Modify:

```text
web-dashboard/prisma/schema.prisma
```

Add `SystemLicense`:

```text
id                 String   @id @default("active")
licenseId          String   @unique
customerName       String
resellerName       String?
siteName           String?
plan               String   @default("basic")
maxUps             Int
features           Json
validFrom          DateTime
validUntil         DateTime?
graceDays          Int      @default(30)
machineCode        String
fingerprintVersion String   @default("v1")
payloadB64         String
signatureB64       String
rawLicense         Json
status             String   @default("active")
installedAt        DateTime @default(now())
lastVerifiedAt     DateTime?
clockLastSeenAt    DateTime?
createdAt          DateTime @default(now())
updatedAt          DateTime @updatedAt
```

Add `LicenseSeat`:

```text
id                String   @id @default(cuid())
seatNo            Int
upsId             String   @unique
deviceId          String?
status            String   @default("active")
assignedAt        DateTime @default(now())
assignedBy        String?
releasedAt        DateTime?
releaseEligibleAt DateTime?
createdAt         DateTime @default(now())
updatedAt         DateTime @updatedAt

@@index([status])
@@index([deviceId])
```

Create migration:

```text
web-dashboard/prisma/migrations/<timestamp>_add_licensing/migration.sql
```

Keep relations simple in V1. Use string IDs first. Do not overcomplicate release with deep Prisma relations.

---

## 10. License library files to add

Create:

```text
web-dashboard/src/lib/license/
```

Files:

```text
types.ts
machine-code.ts
verify.ts
status.ts
enforce.ts
features.ts
```

Responsibilities:

### `types.ts`

Define:

```text
LicenseEnvelope
LicensePayload
LicenseFeatureName
LicenseStatus
LicenseCheckResult
```

### `machine-code.ts`

Implement:

```text
getInstallationId()
getHostFingerprint()
getMachineCode()
```

### `verify.ts`

Implement:

```text
parse license envelope
verify Ed25519 signature
decode payload
check machine code
check valid_from / valid_until / grace
detect clock rollback
return verified result
```

### `status.ts`

Implement:

```text
getLicenseStatus()
getUsedUpsCount()
getRemainingSeats()
getGraceUntil()
getWarnings()
```

### `enforce.ts`

Implement:

```text
requireCanAddUps()
requireCanAssignDevice()
requireFeature()
isLiveSafetyAllowed()
```

### `features.ts`

Define feature gates:

```text
live_monitoring
alarms
energy_analyzer
history
reports
ota
multi_user
multi_site
white_label
board_config
```

---

## 11. Environment variables

Update:

```text
deployment/.env.example
web-dashboard/.env.example
release/dashboard/.env.production.example
deployment/docker-compose.yml
```

Add:

```text
UMS_LICENSE_PATH=/app/data/license/ums-license.json
UMS_LICENSE_PUBLIC_KEY_PEM=<Automatrix public key>
UMS_LICENSE_ENFORCEMENT=enabled
UMS_TRIAL_UPS_LIMIT=0
UMS_TRIAL_DAYS=0
```

For local dev/test only:

```text
UMS_LICENSE_ENFORCEMENT=disabled
```

Production must not silently default to disabled.

Add a Docker volume:

```text
./license:/app/data/license
```

or use existing `web_data` volume if you prefer. But license backup/rehost is easier when `./license` is a visible folder.

---

## 12. Public/private key rule

UMS app contains:

```text
public key only
```

Automatrix generator contains:

```text
private key
```

Never commit:

```text
real private key
customer license private records
license generator private key
production license file
```

Test keys are allowed only under test fixtures and must be clearly marked:

```text
TEST ONLY — NEVER PRODUCTION
```

---

## 13. License API routes to add

Add:

```text
web-dashboard/src/app/api/license/status/route.ts
web-dashboard/src/app/api/license/machine-code/route.ts
web-dashboard/src/app/api/license/activate/route.ts
web-dashboard/src/app/api/license/remove/route.ts
```

### `GET /api/license/status`

Role:

```text
authenticated
```

Return:

```text
status
customer
reseller
site
plan
maxUps
usedUps
remainingUps
validUntil
graceUntil
features
machineCode
warnings
```

### `GET /api/license/machine-code`

Role:

```text
admin or manufacturer
```

Return:

```text
machineCode
fingerprintVersion
```

Do not expose raw serial/MAC/machine-id.

### `POST /api/license/activate`

Role:

```text
manufacturer
```

Accept:

```text
uploaded JSON license file
or pasted activation key/envelope
```

Do:

```text
verify signature
verify machine code
verify date
store SystemLicense
write license file to UMS_LICENSE_PATH if configured
log AuditLog action license.activate
```

### `POST /api/license/remove`

Role:

```text
manufacturer
```

Do:

```text
mark license deactivated
do not hard-delete history
log AuditLog action license.remove
```

---

## 14. License UI to add

Add page:

```text
web-dashboard/src/app/admin/license/page.tsx
```

Add nav item in:

```text
web-dashboard/src/components/AppShell.tsx
```

Nav type must include:

```text
"license"
```

Minimum role:

```text
manufacturer
```

Page must show:

```text
Machine Code
License status
Customer
Reseller
Site
Plan
UPS used / max
Remaining UPS seats
Valid until
Grace until
Feature list
Warnings
Upload license file
Paste activation key
```

Add a banner to main dashboard when:

```text
license missing
license expires within 30 days
license expired/grace
UPS count over limit
```

---

## 15. Enforcement points in current repo

### 15.1 Inventory POST

File:

```text
web-dashboard/src/app/api/inventory/route.ts
```

Before creating/reactivating UPS:

```text
check license status
check active UPS count < maxUps
block if invalid/expired beyond grace
```

Return:

```text
403 or 402
License limit reached: used/max
```

Choose one status code and document it. Recommendation:

```text
403 Forbidden
```

because browsers/proxies handle it more predictably.

---

### 15.2 Inventory PUT bulk update

Same file.

Before applying bulk update:

```text
calculate resulting active UPS count
reject if resulting count > maxUps
```

Important: PUT can create or reactivate many units at once, so single POST check is not enough.

---

### 15.3 Inventory DELETE

Same file.

Currently it sets:

```text
active=false
```

Add seat release behavior:

```text
mark LicenseSeat released
set releaseEligibleAt = now + 7 days
```

This prevents abuse by daily deleting/re-adding UPS to reuse seats.

Recommended first rule:

```text
Released seat becomes reusable after 7 days or manufacturer override.
```

---

### 15.4 Device assignment

There is no dedicated assignment endpoint. Assignment currently happens when inventory POST/PUT includes `deviceId`.

Therefore enforce there first.

If a separate assignment API is added later, enforce there too.

---

### 15.5 MQTT worker

File:

```text
web-dashboard/worker/mqtt-worker.ts
```

Do not block raw board discovery/telemetry.

Rules:

```text
Do not auto-create UPS from MQTT.
Do not auto-consume license seat from raw telemetry.
Unassigned boards may appear on Boards page.
Only assigned active UPS consumes seat.
```

---

### 15.6 Telemetry latest

Do not block latest/live safety data for existing UPS after expiry.

Reason:

```text
industrial safety and client dispute risk
```

---

### 15.7 History/reports/OTA/config

Gate features:

```text
history -> long history endpoint
reports -> future export/report endpoint
ota -> future OTA endpoint
board_config -> /api/board-config
```

Current `/api/board-config` is direct HTTP board configuration. It can remain manufacturer-only. Add license feature gate if you want to sell config/commissioning as premium.

---

## 16. Existing UPS after license downgrade

If active UPS count is more than license max:

```text
status = over_limit
dashboard still shows live safety view
new UPS blocked
reports/history/OTA blocked for over-limit units
license page shows over-limit count
```

Seat allocation rule V1:

```text
licensed seats assigned by LicenseSeat table
if no seats exist, first N active UPS by createdAt are licensed
remaining active UPS are over_limit
```

Do not delete data.

---

## 17. Clock rollback protection

Offline systems can change clock.

Store:

```text
SystemLicense.clockLastSeenAt
```

If system time goes backwards more than allowed tolerance:

```text
mark license suspicious
block add UPS
block license upgrade until manufacturer review
keep existing live safety view
```

Do not completely kill monitoring.

---

## 18. Automatrix license generator

Create:

```text
tools/automatrix-license-generator/
```

This is Automatrix internal only.

Functions:

```text
generate-keypair
show-public-key
generate-license
verify-license
```

Private key location:

```text
~/.automatrix/ums-license/ed25519-private.pem
```

Generated output:

```text
ums-license.json
optional pasteable activation key
```

Do not ship this folder in customer/reseller installer packages.

For source repo, the generator code can exist, but never commit the private key.

---

## 19. Tests to add

Add script:

```text
web-dashboard/scripts/test-license.ts
```

Add npm script:

```text
license:test
```

Test cases:

```text
valid signed license passes
invalid signature fails
wrong machine code fails
expired license returns expired
grace period works
maxUps blocks add UPS
feature false blocks gated feature
clock rollback marks suspicious
```

Add Playwright/API test:

```text
web-dashboard/e2e/12-license.spec.ts
```

Test:

```text
/admin/license renders
machine code visible
invalid license rejected
valid test license accepted
inventory add blocked when maxUps reached
```

Use test keypair only:

```text
web-dashboard/e2e/fixtures/license-test-public.pem
web-dashboard/e2e/fixtures/license-test-private.pem
```

Mark clearly:

```text
TEST ONLY — NEVER PRODUCTION
```

---

## 20. Docs to add/update

Add:

```text
docs/LICENSING.md
release/UMS_LICENSE_ACTIVATION_GUIDE.md
```

Update:

```text
README.md
release/UMS_INSTALLER_CHECKLIST.md
release/UMS_OPERATOR_GUIDE.md
deployment/.env.example
web-dashboard/.env.example
release/dashboard/.env.production.example
```

Docs must explain:

```text
1 UPS = 1 seat
offline activation
Machine Code
license upload
renewal
upgrade UPS count
expired/grace behavior
rehost after PC/server change
reseller workflow
features by plan
Automatrix private key rule
```

Installer checklist must include:

```text
open /admin/license
copy Machine Code
upload license
verify UPS seats
verify expiry
verify features
```

---

## 21. Customer/reseller package policy

For resellers/customers, do not deliver source code.

Deliver:

```text
Windows installer / Linux installer
Docker images
docker-compose package
firmware binary
license upload guide
operator docs
```

Do not deliver:

```text
source code
private license key
license generator private key
.env secrets
DB backups
local logs with secrets
```

Source audit ZIP is for internal/dev only.

---

## 22. Final release proof tasks still required

### 22.1 Docker certification

Run on real Docker host:

```bash
cd deployment
docker compose down -v --remove-orphans
docker compose config
docker compose up -d --build
CERT_ADMIN_PASSWORD=<actual-test-admin-password> bash certify.sh
```

Required:

```text
ALL CERTIFICATION STEPS PASSED
```

Save as UTF-8:

```text
docs/audit/logs/2026-05-25/docker-compose-ps.txt
docs/audit/logs/2026-05-25/certify.txt
```

Do not rely on current `certify.log`; it is a failure log.

---

### 22.2 Real board proof

On site:

```bash
curl -s http://192.168.0.100/api/info
curl -s http://192.168.0.100/data
```

Save as:

```text
docs/audit/logs/2026-05-25/board-api-info.txt
docs/audit/logs/2026-05-25/board-data.txt
```

Required content:

```text
firmware 2.1.0
local broker/server
mqtt_auth true
topic ums/devices/<device_id>/data
```

Screenshots:

```text
docs/audit/screenshots/2026-05-25-live-board/
```

Required screenshots:

```text
Dashboard Online >= 1
Boards MQTT Connected >= 1
LAN scan result
UPS detail live values
Board /api/info
Board /data
```

---

### 22.3 Convert logs

Current logs are UTF-16 `.log`.

Convert final proof logs to:

```text
UTF-8 .txt
```

or force-add `.log` knowingly. Recommended: `.txt`.

---

## 23. Exact Codex prompt

Send Codex this complete prompt:

```text
You are taking over UMS / VOLTAGETEST.

Branch:
energy-analyzer-integration

Do not merge.
Do not tag.
Do not add unrelated features.

Goal:
Finish reseller-safe offline licensing and remaining release gates.

Current verified status:
- Package hygiene is clean.
- npm ci --ignore-scripts passes.
- npm run lint passes.
- Old v0.5.2 / old MQTT topic grep is clean.
- Included Playwright log shows 93 passed.
- Docker certify is NOT proven. Current certify.log is a WSL/bash failure.
- Live board proof is missing.
- Licensing is NOT implemented.

Work in this order.

1. Add signed offline licensing.
Use Ed25519 digital signature.
Do not create custom encoding.
Private key must never be in repo/customer package.
UMS verifies with public key only.
One active monitored UPS = one license seat.

2. Add Prisma models:
SystemLicense
LicenseSeat

Use fields specified in the audit handover:
licenseId, customerName, resellerName, siteName, plan, maxUps, features, validFrom, validUntil, graceDays, machineCode, payloadB64, signatureB64, rawLicense, status, clockLastSeenAt.
LicenseSeat must track seatNo, upsId, deviceId, status, assignedAt, releasedAt, releaseEligibleAt.

3. Add license library:
web-dashboard/src/lib/license/types.ts
web-dashboard/src/lib/license/machine-code.ts
web-dashboard/src/lib/license/verify.ts
web-dashboard/src/lib/license/status.ts
web-dashboard/src/lib/license/enforce.ts
web-dashboard/src/lib/license/features.ts

4. Add env:
UMS_LICENSE_PATH
UMS_LICENSE_PUBLIC_KEY_PEM
UMS_LICENSE_ENFORCEMENT
UMS_TRIAL_UPS_LIMIT
UMS_TRIAL_DAYS

Production must not default license enforcement to disabled.

5. Add APIs:
GET /api/license/status
GET /api/license/machine-code
POST /api/license/activate
POST /api/license/remove

Roles:
status = authenticated
machine-code = admin/manufacturer
activate/remove = manufacturer

6. Add UI:
web-dashboard/src/app/admin/license/page.tsx
Add AppShell nav item "License" for manufacturer.

UI must show:
Machine Code, status, customer, reseller, site, plan, UPS used/max, remaining, expiry, grace, features, warnings, upload license, paste activation key.

7. Enforce licensing in backend:
Modify web-dashboard/src/app/api/inventory/route.ts

POST:
block create/reactivate if no valid license or maxUps reached.

PUT:
calculate resulting active UPS count before applying bulk update; block if over maxUps.

DELETE:
soft delete remains; release LicenseSeat with 7-day cooldown.

No enforcement only in frontend.

8. MQTT rule:
Do not auto-create UPS from MQTT.
Do not auto-consume license seats from raw telemetry.
Unassigned/unlicensed boards may appear on Boards page.
Only active assigned UPS consumes seats.

9. Feature gates:
live_monitoring and alarms remain available for existing licensed UPS.
history gates long history.
reports gates report/export endpoint when present.
ota gates OTA endpoint when present.
board_config gates /api/board-config if enabled commercially.
Expired after grace blocks add/assign/history/report/OTA but keeps live safety view and alarms.

10. Add Automatrix internal generator:
tools/automatrix-license-generator/

Functions:
generate-keypair
show-public-key
generate-license
verify-license

Private key path:
~/.automatrix/ums-license/ed25519-private.pem

Never commit real private key.
Do not ship generator private key to customer/reseller.

11. Add tests:
web-dashboard/scripts/test-license.ts
npm script: license:test
web-dashboard/e2e/12-license.spec.ts

Tests:
valid signed license passes
invalid signature fails
wrong machine code fails
expired license
grace mode
maxUps blocks add UPS
feature false blocks gated feature
clock rollback suspicious
/admin/license renders
invalid upload rejected
valid test license accepted

Use test-only keypair under e2e/fixtures and mark TEST ONLY.

12. Add docs:
docs/LICENSING.md
release/UMS_LICENSE_ACTIVATION_GUIDE.md

Update:
README.md
release/UMS_INSTALLER_CHECKLIST.md
release/UMS_OPERATOR_GUIDE.md
env examples

Docs must explain:
1 UPS = 1 seat
offline activation
Machine Code
license upload
renewal
upgrade seats
expiry/grace
rehost after PC/server change
reseller workflow
private key rule

13. Docker certification:
Run on real Docker host:
cd deployment
docker compose down -v --remove-orphans
docker compose config
docker compose up -d --build
CERT_ADMIN_PASSWORD=<actual-test-admin-password> bash certify.sh

Save UTF-8:
docs/audit/logs/2026-05-25/docker-compose-ps.txt
docs/audit/logs/2026-05-25/certify.txt

certify.txt must contain:
ALL CERTIFICATION STEPS PASSED

14. Final verification:
cd web-dashboard
rm -rf node_modules .next
npm ci
npm run db:generate
npm run lint
npm run build
npm run license:test
npx playwright test
npm audit --omit=dev

15. Clean source package:
git archive --format=zip --output VOLTAGETEST-v2.1.0-source-clean.zip HEAD

Inspect:
unzip -l VOLTAGETEST-v2.1.0-source-clean.zip | grep -E '\.env$|CREDENTIALS|passwords$|backups|node_modules|\.next|playwright-report|test-results|\.err\.log$|\.elf$|\.map$|tsconfig.tsbuildinfo|firmware/.*/build|private.*key|ed25519-private'

Expected:
No matches.

Final report must include:
Branch:
Commit before:
Commit after:

Results:
npm ci:
db generate:
lint:
build:
license:test:
Playwright:
Docker certify:
npm audit:
stale docs grep:
clean package inspect:

Licensing:
algorithm:
private key committed yes/no:
public key location:
APIs added:
UI added:
DB migration added:
enforcement points:
tests:
docs:

Remaining:
live board proof:
physical reference-meter calibration:
security audit debt:

Ship decision:
FAIL / PASS WITH CONDITIONS / PASS

Rules:
FAIL if licensing/build/lint/Docker/docs/package are incomplete.
PASS WITH CONDITIONS only if licensing, code, docs, Docker and package are clean and only live board/calibration remain.
PASS only after live board proof and calibration.
```

---

## 24. Acceptance checklist

Before reseller/client release:

```text
[ ] License system implemented
[ ] Ed25519 signed licenses verify correctly
[ ] Private key is not in repo/package
[ ] Machine Code appears on /admin/license
[ ] License upload/paste works
[ ] max_ups enforced on POST inventory
[ ] max_ups enforced on PUT bulk inventory
[ ] seat release cooldown implemented
[ ] unassigned boards do not consume seats
[ ] expired license keeps live safety view but blocks expansion/premium
[ ] license tests pass
[ ] Playwright license tests pass
[ ] docs/LICENSING.md exists
[ ] release activation guide exists
[ ] installer checklist includes license activation
[ ] npm run lint passes
[ ] npm run build passes
[ ] Docker certify passes all steps
[ ] clean git archive has no secrets/private keys/build outputs
[ ] live board proof attached or release marked PASS WITH CONDITIONS only
```

---

## 25. Final practical recommendation

Do not build online activation server now.

Implement this first:

```text
Automatrix local license generator
Offline signed license file/key
Machine Code from customer system
Backend seat enforcement
/admin/license page
```

Online activation and reseller portal can be Phase 2 after the first reseller release.

This is the fastest secure path for local/offline industrial deployments.
