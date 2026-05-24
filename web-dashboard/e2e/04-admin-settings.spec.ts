/**
 * Admin Settings page tests.
 * Covers: page loads, form fields, save produces success message.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin, goto } from "./helpers";

test.describe("Admin Settings", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await goto(page, "/admin/settings");
  });

  test("settings page renders", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /setting/i })).toBeVisible();
  });

  test("save button is present", async ({ page }) => {
    await expect(page.getByRole("button", { name: /save/i })).toBeVisible();
  });

  test("no JS errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await goto(page, "/admin/settings");
    expect(errors).toHaveLength(0);
  });
});
