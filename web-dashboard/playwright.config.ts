import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright end-to-end test configuration.
 *
 * Tests run against the local dev server (npm run dev).
 * Start the server before running: npm run dev
 * Then: npx playwright test
 *
 * CI / Docker:  set BASE_URL env var to point at the running container.
 */

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "e2e/report", open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3303",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
