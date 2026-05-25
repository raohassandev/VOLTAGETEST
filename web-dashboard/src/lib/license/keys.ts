export const TEST_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA5NJ3jqCG33mX4J2liK5tbNvoTQUonYYgc0kvkcK4DSo=
-----END PUBLIC KEY-----`;

export function isLicenseEnforcementEnabled() {
  const value = (process.env.UMS_LICENSE_ENFORCEMENT ?? "").toLowerCase();
  if (value === "disabled" || value === "false" || value === "0") return false;
  if (value === "enabled" || value === "true" || value === "1") return true;
  return process.env.NODE_ENV === "production";
}

export function getPublicKeyPem() {
  const configured = process.env.UMS_LICENSE_PUBLIC_KEY_PEM;
  if (configured?.trim()) return validateLicensePublicKey(configured.replace(/\\n/g, "\n"));
  if (process.env.NODE_ENV !== "production") return TEST_PUBLIC_KEY_PEM;
  throw new Error("UMS_LICENSE_PUBLIC_KEY_PEM is required when licensing is enforced.");
}

export function validateLicensePublicKey(publicKeyPem: string) {
  const trimmed = publicKeyPem.trim();
  if (!trimmed || trimmed.includes("REPLACE_WITH") || trimmed.includes("...")) {
    throw new Error("UMS_LICENSE_PUBLIC_KEY_PEM must be a real Ed25519 public key, not a placeholder.");
  }
  try {
    const key = crypto.createPublicKey(trimmed);
    const details = key.asymmetricKeyDetails as { namedCurve?: string } | undefined;
    if (key.asymmetricKeyType !== "ed25519" && details?.namedCurve !== "ed25519") {
      throw new Error(`expected Ed25519 public key, got ${key.asymmetricKeyType ?? "unknown"}`);
    }
    return trimmed;
  } catch (error) {
    throw new Error(`Invalid UMS_LICENSE_PUBLIC_KEY_PEM: ${error instanceof Error ? error.message : String(error)}`);
  }
}
import crypto from "crypto";
