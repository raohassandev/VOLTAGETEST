/**
 * API smoke tests — hit every main route and assert HTTP status codes.
 * Uses Playwright's APIRequestContext which persists cookies across calls.
 */
import { test, expect } from "@playwright/test";
import { ADMIN_USER, ADMIN_PASS } from "./helpers";

/** Log in via the form-encoded /api/login endpoint and store session cookie. */
async function login(request: import("@playwright/test").APIRequestContext): Promise<void> {
  const params = new URLSearchParams();
  params.set("username", ADMIN_USER);
  params.set("password", ADMIN_PASS);
  params.set("next", "/");

  const res = await request.post("/api/login", {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: params.toString(),
  });
  // Login redirects (302) or returns 200 — both mean success
  expect([200, 302, 303]).toContain(res.status());
  const roleRes = await request.post("/api/role-select", {
    data: { role: "manufacturer", password: ADMIN_PASS },
  });
  expect(roleRes.status()).toBe(200);
}

test.describe("API smoke tests", () => {
  test.beforeEach(async ({ request }) => {
    await login(request);
  });

  const GET_ROUTES = [
    ["/api/health",            200],
    ["/api/system/health",     200],
    ["/api/system/stats",      200],
    ["/api/settings",          200],
    ["/api/devices",           200],
    ["/api/alarms",            200],
    ["/api/alarm-rules",       200],
    ["/api/inventory",         200],
    ["/api/ups",               200],
    ["/api/telemetry/latest",  200],
    ["/api/users",             200],
    ["/api/discovered",        200],
  ] as const;

  for (const [route, expectedStatus] of GET_ROUTES) {
    test(`GET ${route} → ${expectedStatus}`, async ({ request }) => {
      const res = await request.get(route);
      expect(res.status()).toBe(expectedStatus);
      const body = await res.json();
      expect(body).toBeDefined();
    });
  }

  test("GET /api/system/stats returns row counts", async ({ request }) => {
    const res  = await request.get("/api/system/stats");
    expect(res.status()).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.rawCount).toBe("number");
    expect(typeof body.rollupCount).toBe("number");
    expect(typeof body.alarmCount).toBe("number");
  });

  test("GET /api/settings returns offlineThresholdSecs", async ({ request }) => {
    const res  = await request.get("/api/settings");
    expect(res.status()).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.offlineThresholdSecs).toBe("number");
    expect(body.offlineThresholdSecs as number).toBeGreaterThan(0);
  });

  test("PUT /api/settings updates offlineThresholdSecs", async ({ request }) => {
    const res = await request.put("/api/settings", {
      data: {
        offlineThresholdSecs: 90,
        settings: { rawRetentionDays: 30, rollupRetentionMonths: 12, alarmRetentionMonths: 24 },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.offlineThresholdSecs).toBe(90);

    // Restore original value
    await request.put("/api/settings", {
      data: {
        offlineThresholdSecs: 60,
        settings: { rawRetentionDays: 30, rollupRetentionMonths: 12, alarmRetentionMonths: 24 },
      },
    });
  });

  test("POST /api/system/purge returns deleted counts", async ({ request }) => {
    const res  = await request.post("/api/system/purge");
    expect(res.status()).toBe(200);
    const body = await res.json() as { deleted: { raw: number; rollup: number; alarms: number } };
    expect(typeof body.deleted.raw).toBe("number");
    expect(typeof body.deleted.rollup).toBe("number");
    expect(typeof body.deleted.alarms).toBe("number");
  });

  test("POST /api/devices/{id}/config returns 501 in external-broker mode", async ({ request }) => {
    const res = await request.post("/api/devices/TEST-DEVICE-DUMMY/config", {
      data: { reportingIntervalMs: 5000 },
    });
    // 501 = external broker mode; 404 = device not found but auth passed
    expect([501, 404]).toContain(res.status());
  });

  test("unauthenticated GET /api/settings returns 401", async () => {
    // Create a fresh context with no cookies using the built-in fetch
    const res = await fetch("http://localhost:3303/api/settings");
    expect(res.status).toBe(401);
  });
});
