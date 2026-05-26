import { Page } from "@playwright/test";

export const ADMIN_USER = process.env.TEST_USER || "admin";
export const ADMIN_PASS = process.env.TEST_PASS || "UMS@Local2026!";
export const BASE      = process.env.BASE_URL   || "http://localhost:3303";

/**
 * Log in as admin using the HTML form (POST to /api/login).
 * The login page uses a native form submission, not fetch — so we fill the
 * visible inputs and submit, which follows the redirect automatically.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  // Inputs are inside <label> wrappers; target by name attribute
  await page.locator('input[name="username"]').fill(ADMIN_USER);
  await page.locator('input[name="password"]').fill(ADMIN_PASS);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Server redirects to / or /welcome; wait for navigation to leave /login
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10_000 });
  await page.request.post("/api/role-select", { data: { role: "manufacturer", password: ADMIN_PASS } });
}

/**
 * Navigate to a path and wait for DOM content (not network idle, which hangs
 * on pages that use SSE / long-poll like Boards).
 */
export async function goto(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });
}
