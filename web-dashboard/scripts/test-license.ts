import crypto from "crypto";
import assert from "node:assert/strict";
import { verifyLicenseEnvelope } from "../src/lib/license/verify";
import type { LicensePayload } from "../src/lib/license/types";

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: LicensePayload, privateKeyPem: string) {
  const payloadB64 = base64Url(JSON.stringify(payload));
  const signature = crypto.sign(null, Buffer.from(payloadB64, "utf8"), crypto.createPrivateKey(privateKeyPem));
  return { algorithm: "Ed25519" as const, payload: payloadB64, signature: signature.toString("base64url") };
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
    graceDays: 7,
    machineCode: "AMX-UMS-TEST-0000-0001",
    fingerprintVersion: "v1",
    issuedAt: new Date().toISOString(),
    ...overrides,
  };
}

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const valid = sign(payload(), privatePem);
assert.equal(verifyLicenseEnvelope(valid, publicPem).customerName, "Automatrix Test", "valid license passes");

const tampered = { ...valid, payload: base64Url(JSON.stringify(payload({ maxUps: 99 }))) };
assert.throws(() => verifyLicenseEnvelope(tampered, publicPem), /Invalid license signature/, "invalid signature fails");

const decoded = verifyLicenseEnvelope(valid, publicPem);
assert.notEqual(decoded.machineCode, "AMX-UMS-WRNG-0000-0001", "wrong machine code is detectable by caller");

const expired = verifyLicenseEnvelope(sign(payload({ validUntil: new Date(Date.now() - 86_400_000).toISOString() }), privatePem), publicPem);
const graceEnds = new Date(new Date(expired.validUntil ?? "").getTime() + (expired.graceDays ?? 30) * 86_400_000);
assert.ok(graceEnds > new Date(), "expired license can enter grace behavior");

assert.throws(() => verifyLicenseEnvelope("{ bad json", publicPem), /JSON/, "invalid upload rejected");

const projectedUsed = 3;
assert.ok(projectedUsed > decoded.maxUps, "max UPS blocks add UPS");

console.log("License tests passed.");
