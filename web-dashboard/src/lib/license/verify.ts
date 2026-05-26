import crypto from "crypto";
import type { LicenseEnvelope, LicensePayload } from "./types";
import { getPublicKeyPem } from "./keys";

function fromBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function decodeLicenseEnvelope(raw: unknown): LicenseEnvelope {
  const envelope = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!envelope || typeof envelope !== "object") throw new Error("License must be a JSON object.");
  const candidate = envelope as Partial<LicenseEnvelope>;
  if (candidate.algorithm !== "Ed25519") throw new Error("Unsupported license algorithm.");
  if (!candidate.payload || !candidate.signature) throw new Error("License payload and signature are required.");
  return {
    algorithm: "Ed25519",
    payload: String(candidate.payload),
    signature: String(candidate.signature),
  };
}

export function verifyLicenseEnvelope(raw: unknown, publicKeyPem = getPublicKeyPem()): LicensePayload {
  const envelope = decodeLicenseEnvelope(raw);
  const valid = crypto.verify(
    null,
    Buffer.from(envelope.payload, "utf8"),
    crypto.createPublicKey(publicKeyPem),
    fromBase64Url(envelope.signature),
  );
  if (!valid) throw new Error("Invalid license signature.");

  const payload = JSON.parse(fromBase64Url(envelope.payload).toString("utf8")) as LicensePayload;
  if (payload.schema !== "ums-license-v1") throw new Error("Unsupported license schema.");
  if (!payload.licenseId || !payload.customerName || !payload.machineCode) {
    throw new Error("License is missing required fields.");
  }
  if (!Number.isInteger(payload.maxUps) || payload.maxUps < 1) {
    throw new Error("License maxUps must be at least 1.");
  }
  return payload;
}
