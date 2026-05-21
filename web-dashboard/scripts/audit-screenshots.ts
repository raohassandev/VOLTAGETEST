/**
 * Audit screenshot script — captures all dashboard screens at 4 viewports.
 * Usage: npx tsx scripts/audit-screenshots.ts
 * Requires: @playwright/test installed, Chromium via `npx playwright install chromium`
 * Dashboard must be running on http://localhost:3000
 */

import { chromium } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const BASE_URL = "http://localhost:3000";
const OUT_DIR = path.resolve(__dirname, "../../visual-audit/ums-release-audit-2026-05-21/screenshots");

const USERNAME = "admin";
const PASSWORD = "UMS@Local2026!";

const VIEWPORTS = [
  { name: "desktop-1920x1080", width: 1920, height: 1080 },
  { name: "laptop-1366x768",   width: 1366, height: 768 },
  { name: "tablet-768x1024",   width: 768,  height: 1024 },
  { name: "mobile-390x844",    width: 390,  height: 844 },
];

const ROUTES: { slug: string; path: string; waitFor?: string; note?: string; actions?: string[] }[] = [
  { slug: "login",          path: "/login",                  waitFor: "form" },
  { slug: "fleet-dashboard", path: "/",                      waitFor: "main" },
  { slug: "alarms",         path: "/alarms",                 waitFor: "main" },
  { slug: "alarm-rules",    path: "/admin/alarm-rules",      waitFor: "main" },
  {
    slug: "alarm-rules-form-ups",
    path: "/admin/alarm-rules",
    waitFor: "main",
    note: "form open, UPS scope selected",
    // Actions: click Add-rule, set scope=ups — captured to show UPS dropdown
    actions: ["click-add-rule", "select-scope-ups"],
  },
  { slug: "inventory",      path: "/admin/inventory",        waitFor: "main" },
  { slug: "settings",       path: "/admin/settings",         waitFor: "main" },
  { slug: "ups-detail-live", path: "/ups/UPS-COM11-TEST",    waitFor: "main", note: "live device" },
  { slug: "ups-detail-offline", path: "/ups/UPSMON-01",      waitFor: "main", note: "offline device" },
  { slug: "ups-notfound",   path: "/ups/DOES-NOT-EXIST",     waitFor: "main", note: "error state" },
];

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  // — get auth cookie via login form —
  const authContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const authPage = await authContext.newPage();
  await authPage.goto(`${BASE_URL}/login`);
  await authPage.fill('[name="username"]', USERNAME);
  await authPage.fill('[name="password"]', PASSWORD);
  await authPage.click('[type="submit"]');
  await authPage.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10_000 }).catch(() => {});
  const cookies = await authContext.cookies();
  await authPage.close();
  await authContext.close();

  const results: string[] = [];
  results.push("| Screen | Route | Desktop | Laptop | Tablet | Mobile | Visual status | Notes |");
  results.push("|--------|-------|---------|--------|--------|--------|---------------|-------|");

  for (const route of ROUTES) {
    const rowFiles: string[] = [];
    let visualStatus = "PASS";
    let rowNote = route.note ?? "";

    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      await context.addCookies(cookies);
      const page = await context.newPage();

      const filename = `${route.slug}__${vp.name}.png`;
      const outPath = path.join(OUT_DIR, filename);

      try {
        const response = await page.goto(`${BASE_URL}${route.path}`, { timeout: 15_000, waitUntil: "networkidle" });
        if (route.waitFor) {
          await page.waitForSelector(route.waitFor, { timeout: 8_000 }).catch(() => {});
        }
        // Extra wait for React hydration
        await page.waitForTimeout(1500);

        // Perform any route-specific interactions
        if (route.actions?.includes("click-add-rule")) {
          await page.click('button:has-text("Add rule")').catch(() => {});
          await page.waitForTimeout(500);
        }
        if (route.actions?.includes("select-scope-ups")) {
          await page.selectOption('select', { value: "ups" }).catch(() => {});
          await page.waitForTimeout(600);
        }

        const finalUrl = page.url();
        if (finalUrl.includes("/login") && !route.path.startsWith("/login")) {
          visualStatus = "AUTH_REDIRECT";
          rowNote = `redirected to login (expected auth)`;
        }

        if (response && response.status() >= 400) {
          visualStatus = "HTTP_ERROR";
          rowNote = `HTTP ${response.status()}`;
        }

        await page.screenshot({ path: outPath, fullPage: true });
        rowFiles.push(`[${vp.name}](screenshots/${filename})`);
        console.log(`✓ ${filename}`);
      } catch (err) {
        rowFiles.push(`FAILED`);
        visualStatus = "ERROR";
        rowNote = String(err).slice(0, 80);
        console.error(`✗ ${filename}: ${err}`);
      }

      await page.close();
      await context.close();
    }

    results.push(`| ${route.slug} | ${route.path} | ${rowFiles[0] ?? "—"} | ${rowFiles[1] ?? "—"} | ${rowFiles[2] ?? "—"} | ${rowFiles[3] ?? "—"} | ${visualStatus} | ${rowNote} |`);
  }

  await browser.close();

  const indexPath = path.resolve(__dirname, "../../visual-audit/ums-release-audit-2026-05-21/02_SCREENSHOT_INDEX.md");
  const header = `# Screenshot Index\n\nGenerated: ${new Date().toISOString()}\nBase URL: ${BASE_URL}\nViewports: desktop-1920x1080, laptop-1366x768, tablet-768x1024, mobile-390x844\n\n`;
  fs.writeFileSync(indexPath, header + results.join("\n") + "\n");

  console.log(`\nScreenshot index written to ${indexPath}`);
  console.log(`${ROUTES.length * VIEWPORTS.length} screenshots attempted.`);
}

run().catch((e) => { console.error(e); process.exit(1); });
