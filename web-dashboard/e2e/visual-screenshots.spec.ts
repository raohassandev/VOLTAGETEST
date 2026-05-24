/**
 * Visual screenshot capture for QA review.
 * Saves to qa/screenshots/web/desktop/ and qa/screenshots/web/mobile/
 *
 * Run: npx playwright test e2e/visual-screenshots.spec.ts
 */
import { test, Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { loginAsAdmin, goto } from "./helpers";

const DESKTOP_DIR = path.resolve(__dirname, "../qa/screenshots/web/desktop");
const MOBILE_DIR  = path.resolve(__dirname, "../qa/screenshots/web/mobile");

function ensureDirs() {
  fs.mkdirSync(DESKTOP_DIR, { recursive: true });
  fs.mkdirSync(MOBILE_DIR, { recursive: true });
}

async function shot(page: Page, dir: string, filename: string) {
  await page.screenshot({ path: path.join(dir, filename), fullPage: false });
}

// ── Desktop screenshots at 1440×900 ──────────────────────────────────────────

test.describe("Desktop screenshots (1440×900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    ensureDirs();
    await loginAsAdmin(page);
  });

  test("01 dashboard", async ({ page }) => {
    await goto(page, "/");
    await page.waitForTimeout(800);
    await shot(page, DESKTOP_DIR, "01-dashboard-desktop.png");
  });

  test("02 ups detail", async ({ page }) => {
    // Navigate to first UPS if available, else skip gracefully
    await goto(page, "/");
    const firstLink = page.locator('a[href^="/ups/"]').first();
    const count = await firstLink.count();
    if (count > 0) {
      await firstLink.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(600);
    } else {
      await goto(page, "/ups/UMS-3076F5A5AD54");
    }
    await shot(page, DESKTOP_DIR, "02-ups-detail-desktop.png");
  });

  test("03 alarms", async ({ page }) => {
    await goto(page, "/alarms");
    await page.waitForTimeout(600);
    await shot(page, DESKTOP_DIR, "03-alarms-desktop.png");
  });

  test("04 alarm rules", async ({ page }) => {
    await goto(page, "/admin/alarm-rules");
    await shot(page, DESKTOP_DIR, "04-alarm-rules-desktop.png");
  });

  test("05 inventory", async ({ page }) => {
    await goto(page, "/admin/inventory");
    await shot(page, DESKTOP_DIR, "05-inventory-desktop.png");
  });

  test("06 boards", async ({ page }) => {
    await goto(page, "/admin/boards");
    await page.waitForTimeout(800);
    await shot(page, DESKTOP_DIR, "06-boards-desktop.png");
  });

  test("07 settings", async ({ page }) => {
    await goto(page, "/admin/settings");
    await shot(page, DESKTOP_DIR, "07-settings-desktop.png");
  });

  test("08 users", async ({ page }) => {
    await goto(page, "/admin/users");
    await shot(page, DESKTOP_DIR, "08-users-desktop.png");
  });

  test("09 system parameters", async ({ page }) => {
    await goto(page, "/admin/system/params");
    await shot(page, DESKTOP_DIR, "09-system-parameters-desktop.png");
  });

  test("10 history control", async ({ page }) => {
    await goto(page, "/admin/system/history");
    await page.waitForTimeout(600);
    await shot(page, DESKTOP_DIR, "10-history-control-desktop.png");
  });

  test("11 feature flags", async ({ page }) => {
    await goto(page, "/admin/system/features");
    await page.waitForTimeout(600);
    await shot(page, DESKTOP_DIR, "11-feature-flags-desktop.png");
  });

  test("12 login page", async ({ page }) => {
    // Go to login without session
    await page.context().clearCookies();
    await goto(page, "/login");
    await shot(page, DESKTOP_DIR, "12-login-desktop.png");
  });

  test("13 welcome / session expired", async ({ page }) => {
    await page.context().clearCookies();
    await goto(page, "/welcome");
    await shot(page, DESKTOP_DIR, "13-welcome-expired-desktop.png");
  });
});

// ── Mobile screenshots at 390×844 ────────────────────────────────────────────

test.describe("Mobile screenshots (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    ensureDirs();
    await loginAsAdmin(page);
  });

  test("m01 dashboard", async ({ page }) => {
    await goto(page, "/");
    await page.waitForTimeout(800);
    await shot(page, MOBILE_DIR, "m01-dashboard-mobile.png");
  });

  test("m02 ups detail", async ({ page }) => {
    await goto(page, "/ups/UMS-3076F5A5AD54");
    await page.waitForTimeout(600);
    await shot(page, MOBILE_DIR, "m02-ups-detail-mobile.png");
  });

  test("m03 alarms", async ({ page }) => {
    await goto(page, "/alarms");
    await page.waitForTimeout(600);
    await shot(page, MOBILE_DIR, "m03-alarms-mobile.png");
  });

  test("m04 boards", async ({ page }) => {
    await goto(page, "/admin/boards");
    await page.waitForTimeout(800);
    await shot(page, MOBILE_DIR, "m04-boards-mobile.png");
  });

  test("m05 settings", async ({ page }) => {
    await goto(page, "/admin/settings");
    await shot(page, MOBILE_DIR, "m05-settings-mobile.png");
  });

  test("m06 login", async ({ page }) => {
    await page.context().clearCookies();
    await goto(page, "/login");
    await shot(page, MOBILE_DIR, "m06-login-mobile.png");
  });
});
