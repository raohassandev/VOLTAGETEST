const PLACEHOLDER_SECRETS: [string, string][] = [
  ["UPS_AUTH_TOKEN", "replace-with-a-long-random-session-token"],
  ["POSTGRES_PASSWORD", "change-this-db-password"],
  ["MQTT_PASSWORD", "change-this-mqtt-password"],
];

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const isProduction = process.env.NODE_ENV === "production";
    const hasToken = Boolean(process.env.UPS_AUTH_TOKEN);
    const hasHash = Boolean(process.env.UPS_AUTH_PASSWORD_HASH);
    const hasPassword = Boolean(process.env.UPS_AUTH_PASSWORD);
    const allowDevAuth = process.env.ALLOW_DEV_AUTH === "true";

    if (isProduction) {
      // Refuse startup if any placeholder secret is still in use.
      for (const [name, placeholder] of PLACEHOLDER_SECRETS) {
        if (process.env[name] === placeholder) {
          throw new Error(
            `[startup] FATAL: ${name} is still set to the placeholder value "${placeholder}". ` +
            `Replace it with a real secret before running in production.`,
          );
        }
      }

      if (!hasToken) {
        console.error("[auth] FATAL: UPS_AUTH_TOKEN is not set. Login will be blocked in production.");
      }
      if (!hasHash && !hasPassword) {
        console.error("[auth] FATAL: Neither UPS_AUTH_PASSWORD_HASH nor UPS_AUTH_PASSWORD is set. Login will be blocked in production.");
      }
      if (hasPassword && !hasHash) {
        console.warn("[auth] WARNING: UPS_AUTH_PASSWORD is set as plain text. Use UPS_AUTH_PASSWORD_HASH (bcrypt) for production security.");
      }
      if (allowDevAuth) {
        console.error("[auth] FATAL: ALLOW_DEV_AUTH=true is set in production. Remove this immediately.");
      }
    } else {
      if (!hasToken && !allowDevAuth) {
        console.warn("[auth] No UPS_AUTH_TOKEN set and ALLOW_DEV_AUTH is not enabled. Login will fail. Set ALLOW_DEV_AUTH=true for local dev without a token.");
      }
      if (allowDevAuth) {
        console.warn("[auth] ALLOW_DEV_AUTH=true — dev auth bypass is active. Do not use in production.");
      }
    }
  }
}
