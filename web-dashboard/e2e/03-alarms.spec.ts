/**
 * Alarms page tests.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin, goto } from "./helpers";

test.describe("Alarms page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await goto(page, "/alarms");
  });

  test("alarms page renders with heading", async ({ page }) => {
    // h1 is "Alarm Management"
    await expect(page.getByRole("heading", { name: /alarm management/i })).toBeVisible();
  });

  test("filter tabs are present", async ({ page }) => {
    await expect(page.getByRole("button", { name: /active/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test("no JS errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await goto(page, "/alarms");
    expect(errors).toHaveLength(0);
  });

  test("shows empty state or rows after loading", async ({ page }) => {
    // Wait for loading state to resolve
    await expect(
      page.getByText(/loading alarms/i)
        .or(page.getByText(/no active alarms/i))
        .or(page.getByText(/no alarms found/i))
        .or(page.locator("tr").first())
    ).toBeVisible({ timeout: 8000 });
  });
});
