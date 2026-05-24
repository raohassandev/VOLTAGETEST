/**
 * System sub-pages tests.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin, goto } from "./helpers";

test.describe("System index", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("system page renders all 4 cards as links", async ({ page }) => {
    await goto(page, "/admin/system");
    await expect(page.getByRole("link", { name: /sensor calibration/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /history control/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /feature flag/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /system parameter/i })).toBeVisible();
  });

  test("no 'coming soon' badges remain", async ({ page }) => {
    await goto(page, "/admin/system");
    await expect(page.getByText(/coming soon/i)).toHaveCount(0);
  });
});

test.describe("System Parameters page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await goto(page, "/admin/system/params");
  });

  test("renders heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /system parameter/i })).toBeVisible();
  });

  test("shows Offline threshold field", async ({ page }) => {
    await expect(page.getByText(/offline threshold/i)).toBeVisible({ timeout: 8000 });
    await expect(page.locator("input[type='number']").first()).toBeVisible();
  });

  test("shows 3 retention fields", async ({ page }) => {
    await expect(page.getByText(/raw telemetry retention/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/rollup retention/i)).toBeVisible();
    await expect(page.getByText(/alarm history retention/i)).toBeVisible();
  });

  test("Save Parameters button saves and shows confirmation", async ({ page }) => {
    await expect(page.locator("input[type='number']").first()).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /save parameter/i }).click();
    await expect(page.getByText(/settings saved/i)).toBeVisible({ timeout: 6000 });
  });

  test("no JS errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await goto(page, "/admin/system/params");
    expect(errors).toHaveLength(0);
  });
});

test.describe("History Control page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await goto(page, "/admin/system/history");
  });

  test("renders heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /history control/i })).toBeVisible();
  });

  test("shows retention policy section", async ({ page }) => {
    await expect(page.getByText(/active retention policy/i)).toBeVisible({ timeout: 8000 });
  });

  test("shows database row counts section", async ({ page }) => {
    await expect(page.getByText(/database row count/i)).toBeVisible({ timeout: 8000 });
  });

  test("shows Run Purge Now button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /run purge now/i })).toBeVisible({ timeout: 8000 });
  });

  test("Edit link navigates to params page", async ({ page }) => {
    await expect(page.getByText(/active retention policy/i)).toBeVisible({ timeout: 8000 });
    await page.getByRole("link", { name: /edit/i }).click();
    await expect(page).toHaveURL(/\/admin\/system\/params/);
  });

  test("no JS errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await goto(page, "/admin/system/history");
    expect(errors).toHaveLength(0);
  });
});

test.describe("Feature Flags page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await goto(page, "/admin/system/features");
  });

  test("renders heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /feature flag/i })).toBeVisible();
  });

  test("shows server uptime section", async ({ page }) => {
    await expect(page.getByText(/uptime/i)).toBeVisible({ timeout: 8000 });
  });

  test("shows PostgreSQL and MQTT feature rows", async ({ page }) => {
    await expect(page.getByText(/postgresql database/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/mqtt broker/i)).toBeVisible({ timeout: 8000 });
  });

  test("shows MQTT Worker as exact text (not substring)", async ({ page }) => {
    // Use exact match to avoid strict-mode violation with multiple elements
    await expect(page.getByText("MQTT Worker", { exact: true })).toBeVisible({ timeout: 8000 });
  });

  test("shows Alarm Engine and LAN Device Scanner rows", async ({ page }) => {
    await expect(page.getByText("Alarm Engine", { exact: true })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("LAN Device Scanner", { exact: true })).toBeVisible({ timeout: 8000 });
  });

  test("no JS errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await goto(page, "/admin/system/features");
    expect(errors).toHaveLength(0);
  });
});
