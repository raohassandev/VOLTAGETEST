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
  if (configured?.trim()) return configured.replace(/\\n/g, "\n");
  if (process.env.NODE_ENV !== "production") return TEST_PUBLIC_KEY_PEM;
  throw new Error("UMS_LICENSE_PUBLIC_KEY_PEM is required when licensing is enforced.");
}
