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
