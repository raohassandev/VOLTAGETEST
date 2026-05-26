/**
 * Authentication flow tests.
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Authentication", () => {
  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    // h1 says "UMS — UPS Monitoring"
    await expect(page.getByRole("heading", { name: /UPS Monitoring/i })).toBeVisible();
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("shows error on wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="username"]').fill("admin");
    await page.locator('input[name="password"]').fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();
    // Server form POST returns to /login?error=1
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    await expect(page.getByText(/invalid username or password/i)).toBeVisible({ timeout: 5000 });
  });

  test("successful login lands on a protected page", async ({ page }) => {
    await loginAsAdmin(page);
    // Should be on any page that is NOT /login
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("unauthenticated access to protected page redirects away from settings", async ({ page }) => {
    // Without a session, accessing /admin/settings should redirect (to /welcome or /login)
    await page.goto("/admin/settings");
    // Must NOT stay on /admin/settings
    await expect(page).not.toHaveURL(/\/admin\/settings/, { timeout: 8000 });
  });

  test("logout clears session", async ({ page }) => {
    await loginAsAdmin(page);
    // Navigate to dashboard which has AppShell with Sign out
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    // The mobile menu has "Sign out" text; the desktop has "Exit"
    // Open mobile menu first to access Sign out in mobile nav (more reliable)
    const mobileMenu = page.locator('[aria-label="Open menu"], button[aria-label*="menu"]').first();
    if (await mobileMenu.isVisible()) {
      await mobileMenu.click();
      await page.getByRole("button", { name: /sign out/i }).click();
    } else {
      // Desktop: logout form button shows "Exit" text or has type="submit" in logout form
      const logoutForm = page.locator('form[action="/api/logout"]').first();
      await logoutForm.locator('button[type="submit"]').click();
    }
    // Logout redirects to /welcome (not /login) — verify we're no longer authenticated
    // by trying to access a protected route which should redirect away
    await page.goto("/admin/settings");
    await expect(page).not.toHaveURL(/\/admin\/settings/, { timeout: 8000 });
  });
});
