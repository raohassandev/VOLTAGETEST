/**
 * Admin Boards page tests.
 * Note: this page uses SSE/polling — do NOT use networkidle; use domcontentloaded.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin, goto } from "./helpers";

test.describe("Admin Boards", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await goto(page, "/admin/boards");
  });

  test("boards page renders with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Board Management" })).toBeVisible({ timeout: 8000 });
  });

  test("tab bar present (MQTT / Discovered / All)", async ({ page }) => {
    // Tabs are rendered as buttons — wait for hydration
    await expect(
      page.getByRole("button", { name: /mqtt/i })
        .or(page.getByRole("button", { name: /discovered/i }))
        .first()
    ).toBeVisible({ timeout: 8000 });
  });

  test("Scan button is present", async ({ page }) => {
    await expect(page.getByRole("button", { name: /scan/i })).toBeVisible({ timeout: 8000 });
  });

  test("search input works", async ({ page }) => {
    const search = page.getByPlaceholder(/search/i);
    await expect(search).toBeVisible({ timeout: 8000 });
    await search.fill("UMS-");
    await expect(search).toHaveValue("UMS-");
  });

  test("no JS errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await goto(page, "/admin/boards");
    await page.waitForTimeout(1000);
    expect(errors).toHaveLength(0);
  });
});
