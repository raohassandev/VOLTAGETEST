"use client";

/**
 * Shared session-expiry handler for all client-side fetch calls.
 *
 * On the first 401 response from any authenticated API endpoint this module
 * redirects to /welcome?expired=1 and prevents all subsequent redirects via a
 * module-level flag (one redirect per page load, regardless of how many polls
 * fire before navigation completes).
 *
 * Usage:
 *   const res = await fetch("/api/...");
 *   if (checkUnauthorized(res)) return;   // stops the current function
 *   if (!res.ok) { /* handle other errors *\/ return; }
 */

let _handled = false;

/**
 * Read the role from the ups_user cookie (client-side, same logic as AppShell).
 * Returns "viewer" if the cookie is absent or unreadable.
 */
export function readRoleCookie(): string {
  if (typeof document === "undefined") return "viewer";
  const match = document.cookie.match(/(?:^|;\s*)ups_user=([^;]*)/);
  if (!match) return "viewer";
  try {
    const value = decodeURIComponent(match[1]);
    const payload = value.includes(".") ? value.slice(0, value.lastIndexOf(".")) : value;
    const parsed = JSON.parse(atob(payload)) as { role?: string };
    return parsed.role ?? "viewer";
  } catch {
    return "viewer";
  }
}

/**
 * Redirect to / if the current user is not manufacturer.
 * Call once at the top of a manufacturer-only page component.
 */
export function guardManufacturer(): void {
  if (readRoleCookie() !== "manufacturer") {
    window.location.replace("/");
  }
}

/** Fire once: redirect to /welcome?expired=1 after a short delay. */
export function handleUnauthorized(): void {
  if (_handled) return;
  _handled = true;
  window.setTimeout(() => {
    window.location.href = "/welcome?expired=1";
  }, 200);
}

/**
 * Check if a Response is 401. If so, fire the redirect and return true so the
 * caller can immediately return/break out of its fetch callback.
 */
export function checkUnauthorized(res: Response): boolean {
  if (res.status === 401) {
    handleUnauthorized();
    return true;
  }
  return false;
}
