/**
 * Admin Alarm Rules page tests.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin, goto } from "./helpers";

test.describe("Admin Alarm Rules", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await goto(page, "/admin/alarm-rules");
  });

  test("alarm rules page renders", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /alarm rule/i })).toBeVisible();
  });

  test("clicking Add rule shows form with metric select and threshold inputs", async ({ page }) => {
    // Form is hidden initially — click "Add rule" to reveal it
    await page.getByRole("button", { name: /add rule/i }).click();
    // Native <select> for Metric and Scope should now be visible
    await expect(page.locator("select").first()).toBeVisible({ timeout: 5000 });
    // Number inputs for thresholds
    await expect(page.locator("input[type='number']").first()).toBeVisible();
  });

  test("Save rule button visible after opening form", async ({ page }) => {
    await page.getByRole("button", { name: /add rule/i }).click();
    await expect(page.getByRole("button", { name: /save rule/i })).toBeVisible({ timeout: 5000 });
  });

  test("no JS errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await goto(page, "/admin/alarm-rules");
    expect(errors).toHaveLength(0);
  });
});
