/**
 * Admin Inventory (UPS units) page tests.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin, goto } from "./helpers";

test.describe("Admin Inventory", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await goto(page, "/admin/inventory");
  });

  test("inventory page renders h1", async ({ page }) => {
    // h1 is "UPS Inventory"
    await expect(page.getByRole("heading", { name: "UPS Inventory" })).toBeVisible();
  });

  test("Add UPS form is present", async ({ page }) => {
    await expect(page.getByPlaceholder(/e\.g\. UPS/i)).toBeVisible();
  });

  test("Save button disabled when UPS ID is empty", async ({ page }) => {
    // Button has disabled={saving || !form.upsId} — on fresh load upsId is empty
    const saveBtn = page.getByRole("button", { name: /save|add/i }).first();
    await expect(saveBtn).toBeDisabled();
  });

  test("no JS errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await goto(page, "/admin/inventory");
    expect(errors).toHaveLength(0);
  });
});
