# UMS Offline Licensing

UMS uses offline Ed25519-signed licenses for commercial releases. There is no online activation server.

## Design

- Automatrix owns the Ed25519 private signing key.
- The private key is stored outside the repository by the internal generator.
- UMS deployments receive only the public key through `UMS_LICENSE_PUBLIC_KEY_PEM`.
- Each active UPS consumes one seat.
- Unassigned boards may appear on the Boards page without consuming seats.
- MQTT telemetry never auto-consumes a license seat.
- Existing live monitoring and alarms continue after license expiry so site safety is not interrupted.
- Adding UPS units and gated features are blocked when the license is missing, invalid, expired, wrong-machine, or over the seat limit.

## Environment

Production Docker deployments must set:

```env
UMS_LICENSE_ENFORCEMENT=enabled
UMS_LICENSE_PATH=/app/data/license/ums-license.json
UMS_LICENSE_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

Local development may set `UMS_LICENSE_ENFORCEMENT=disabled`.

## Activation

1. Sign in as a manufacturer user.
2. Open `/admin/license`.
3. Copy the machine code.
4. Send the machine code and required seat count to Automatrix.
5. Paste the returned activation JSON into the page.
6. Click Activate.

## Enforcement Points

- `POST /api/inventory`: blocks adding or reactivating UPS units beyond license seats.
- `PUT /api/inventory`: blocks bulk inventory updates that add active UPS units beyond seats.
- `DELETE /api/inventory`: releases the UPS seat after the UPS is deactivated.
- `GET /api/telemetry/history`: requires the `history` feature.
- `POST /api/board-config`: requires the `board_config` feature.
- `POST /api/devices/[deviceId]/config`: requires the `board_config` feature.
- `POST /api/devices/[deviceId]/command` with `cmd=ota`: requires the `ota` feature.

## Internal Generator

Use `tools/automatrix-license-generator/`. The signing key is created outside the repository at `~/.automatrix/ums-license/signing.pem`.

```bash
cd tools/automatrix-license-generator
node index.mjs generate-keypair
node index.mjs show-public-key
node index.mjs generate-license --machine AMX-UMS-XXXX-XXXX-XXXX --customer "Customer" --max-ups 5 --valid-until 2027-05-25 --out license.json
```

Never copy the signing key into the UMS repository, Docker image, deployment folder, or source package.
