import crypto from "crypto";
import assert from "node:assert/strict";
import { getLicenseStatus } from "../src/lib/license/status";
import { requireCanAddUps, requireFeature } from "../src/lib/license/enforce";
import { validateLicensePublicKey } from "../src/lib/license/keys";
import { verifyLicenseEnvelope } from "../src/lib/license/verify";
import type { LicenseEnvelope, LicensePayload } from "../src/lib/license/types";

const MACHINE_CODE = "AMX-UMS-TEST-0000-0001";

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: LicensePayload, privateKeyPem: string): LicenseEnvelope {
  const payloadB64 = base64Url(JSON.stringify(payload));
  const signature = crypto.sign(null, Buffer.from(payloadB64, "utf8"), crypto.createPrivateKey(privateKeyPem));
  return { algorithm: "Ed25519", payload: payloadB64, signature: signature.toString("base64url") };
}

function payload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    schema: "ums-license-v1",
    licenseId: crypto.randomUUID(),
    customerName: "Automatrix Test",
    plan: "test",
    maxUps: 2,
    features: { history: true, reports: true, ota: true, board_config: true },
    validFrom: new Date(Date.now() - 60_000).toISOString(),
    validUntil: new Date(Date.now() + 86_400_000).toISOString(),
    graceDays: 0,
    machineCode: MACHINE_CODE,
    fingerprintVersion: "v1",
    issuedAt: new Date().toISOString(),
    ...overrides,
  };
}

function rowFromEnvelope(envelope: LicenseEnvelope, p: LicensePayload) {
  return {
    id: "active",
    status: "active",
    maxUps: p.maxUps,
    payloadB64: envelope.payload,
    signatureB64: envelope.signature,
  };
}

function fakePrisma(options: { licenseRow?: unknown; activeUps: number }) {
  return {
    upsUnit: {
      count: async ({ where }: { where?: { active?: boolean } } = {}) => (where?.active ? options.activeUps : options.activeUps),
    },
    systemLicense: {
      findUnique: async () => options.licenseRow ?? null,
    },
  };
}

async function responseJson(response: Response | null) {
  return response ? await response.json() as Record<string, unknown> : null;
}

async function main() {
  const previousEnv = { ...process.env };
  Object.assign(process.env, { NODE_ENV: "production" });
  process.env.UMS_LICENSE_ENFORCEMENT = "enabled";
  process.env.UMS_MACHINE_CODE = MACHINE_CODE;

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  process.env.UMS_LICENSE_PUBLIC_KEY_PEM = publicPem;

  const activePayload = payload();
  const activeEnvelope = sign(activePayload, privatePem);
  const activeRow = rowFromEnvelope(activeEnvelope, activePayload);

  assert.equal(verifyLicenseEnvelope(activeEnvelope, publicPem).customerName, "Automatrix Test", "valid signed license accepted");

  const tampered = { ...activeEnvelope, payload: base64Url(JSON.stringify(payload({ maxUps: 99 }))) };
  assert.throws(() => verifyLicenseEnvelope(tampered, publicPem), /Invalid license signature/, "invalid signature rejected");

  let status = await getLicenseStatus(fakePrisma({ licenseRow: activeRow, activeUps: 1 }) as never);
  assert.equal(status.state, "active", "license status API logic returns active state");
  assert.equal(status.canAddUps, true, "valid license allows adding UPS when seats remain");
  assert.equal(status.usedUps, 1, "active monitored UPS count equals used seat count");
  assert.equal(status.remainingUps, 1, "remaining seat count is calculated");
  assert.equal(status.liveMonitoringAllowed, true, "live monitoring safety path remains enabled");
  assert.equal(status.alarmsAllowed, true, "alarm safety path remains enabled");

  status = await getLicenseStatus(fakePrisma({ activeUps: 0 }) as never);
  assert.equal(status.state, "missing", "no license status is missing");
  let blocked = await requireCanAddUps(fakePrisma({ activeUps: 0 }) as never, 1);
  assert.equal(blocked?.status, 402, "no license blocks adding UPS");

  blocked = await requireCanAddUps(fakePrisma({ licenseRow: activeRow, activeUps: 1 }) as never, 1);
  assert.equal(blocked, null, "valid license allows adding UPS");

  blocked = await requireCanAddUps(fakePrisma({ licenseRow: activeRow, activeUps: 2 }) as never, 1);
  assert.equal(blocked?.status, 402, "maxUps seat limit blocks extra active UPS");
  assert.match(String((await responseJson(blocked))?.error), /seat limit/i, "seat limit response explains block");

  status = await getLicenseStatus(fakePrisma({ licenseRow: activeRow, activeUps: 0 }) as never);
  assert.equal(status.usedUps, 0, "inactive UPS does not consume active monitored seat when excluded from active count");

  const wrongMachinePayload = payload({ machineCode: "AMX-UMS-WRNG-0000-0001" });
  const wrongMachineRow = rowFromEnvelope(sign(wrongMachinePayload, privatePem), wrongMachinePayload);
  status = await getLicenseStatus(fakePrisma({ licenseRow: wrongMachineRow, activeUps: 0 }) as never);
  assert.equal(status.state, "wrong_machine", "wrong machine code rejected");

  const expiredPayload = payload({ validUntil: new Date(Date.now() - 86_400_000).toISOString(), graceDays: 0 });
  const expiredRow = rowFromEnvelope(sign(expiredPayload, privatePem), expiredPayload);
  status = await getLicenseStatus(fakePrisma({ licenseRow: expiredRow, activeUps: 1 }) as never);
  assert.equal(status.state, "expired", "expired license status returned");
  assert.equal(status.canAddUps, false, "expired license blocks expansion");
  assert.equal(status.features.history, true, "expired status reports licensed payload features for visibility");
  blocked = await requireFeature(fakePrisma({ licenseRow: expiredRow, activeUps: 1 }) as never, "history");
  assert.equal(blocked?.status, 402, "expired license blocks premium features");
  assert.equal(status.liveMonitoringAllowed, true, "expired license does not stop existing telemetry safety paths");
  assert.equal(status.alarmsAllowed, true, "expired license does not stop alarm safety paths");

  assert.throws(() => verifyLicenseEnvelope("{ bad json", publicPem), /JSON/, "invalid upload rejected safely");
  assert.throws(() => validateLicensePublicKey(""), /real Ed25519/, "missing key rejected");
  assert.throws(() => validateLicensePublicKey("REPLACE_WITH_AUTOMATRIX_PUBLIC_KEY"), /placeholder/, "placeholder key rejected");
  assert.throws(() => validateLicensePublicKey("not a pem"), /Invalid UMS_LICENSE_PUBLIC_KEY_PEM/, "invalid PEM rejected");
  assert.equal(validateLicensePublicKey(publicPem), publicPem.trim(), "valid Ed25519 public key accepted");

  process.env = previousEnv;
  console.log("License tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
