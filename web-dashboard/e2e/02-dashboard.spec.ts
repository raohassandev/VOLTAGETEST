/**
 * Main dashboard (/) tests.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin, goto } from "./helpers";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("dashboard loads with stat cards", async ({ page }) => {
    await goto(page, "/");
    await expect(page.getByText(/total ups|total devices/i).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/online/i).first()).toBeVisible();
    await expect(page.getByText(/alarm/i).first()).toBeVisible();
  });

  test("nav links are present — Alarms and Settings", async ({ page }) => {
    await goto(page, "/");
    // Nav uses exact label text from AppShell config
    await expect(page.getByRole("link", { name: "Alarms" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  });

  test("search input is present and interactive", async ({ page }) => {
    await goto(page, "/");
    const search = page.getByPlaceholder(/search/i);
    await expect(search).toBeVisible();
    await search.fill("test-device");
    await expect(search).toHaveValue("test-device");
  });

  test("page does not show JS error on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await goto(page, "/");
    expect(errors).toHaveLength(0);
  });
});
