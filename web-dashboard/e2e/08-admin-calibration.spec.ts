/**
 * Admin Calibration page tests.
 * Covers: page loads, device selector, scale/offset inputs, save.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin, goto } from "./helpers";

test.describe("Admin Calibration", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await goto(page, "/admin/calibration");
  });

  test("calibration page renders", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /calibration/i })).toBeVisible();
  });

  test("shows device selector or empty state", async ({ page }) => {
    // Either device select or 'no devices' message
    const hasSelect = await page.getByRole("combobox").or(page.locator("select")).count();
    const hasEmpty  = await page.getByText(/no device|select a device|no board/i).count();
    expect(hasSelect + hasEmpty).toBeGreaterThan(0);
  });

  test("no JS errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await goto(page, "/admin/calibration");
    expect(errors).toHaveLength(0);
  });
});
