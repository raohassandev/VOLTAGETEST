import { test, expect } from "@playwright/test";
import { goto, loginAsAdmin } from "./helpers";

test.describe("License admin", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await goto(page, "/admin/license");
  });

  test("license page renders", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /^license$/i })).toBeVisible();
    await expect(page.locator(".font-mono").filter({ hasText: /AMX-UMS-|Loading/i }).first()).toBeVisible();
  });

  test("invalid upload is rejected", async ({ page }) => {
    await page.locator("#license-json").fill('{"algorithm":"Ed25519","payload":"bad","signature":"bad"}');
    await page.getByRole("button", { name: /activate/i }).click();
    await expect(page.getByText(/invalid|signature|license/i).last()).toBeVisible();
  });
});
