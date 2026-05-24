/**
 * Admin Users page tests.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin, goto } from "./helpers";

test.describe("Admin Users", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await goto(page, "/admin/users");
  });

  test("users page renders", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /users/i })).toBeVisible();
  });

  test("admin user is listed", async ({ page }) => {
    await expect(page.getByText("admin").first()).toBeVisible({ timeout: 8000 });
  });

  test("clicking Add user reveals form with username input", async ({ page }) => {
    // Form is hidden initially — click Add user to reveal it
    await page.getByRole("button", { name: /add user/i }).click();
    await expect(page.getByRole("heading", { name: /new user/i })).toBeVisible();
    await expect(page.getByText("Username").first()).toBeVisible();
  });

  test("Create button is disabled when username/password empty", async ({ page }) => {
    await page.getByRole("button", { name: /add user/i }).click();
    // After opening form — username and password are empty → button disabled
    await expect(
      page.getByRole("button", { name: /^creating|^create user/i }).first()
    ).toBeDisabled({ timeout: 5000 });
  });

  test("no JS errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await goto(page, "/admin/users");
    expect(errors).toHaveLength(0);
  });
});
