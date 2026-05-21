// Deprecated: middleware.ts is no longer used in Next.js 16.
// Route protection is handled by proxy.ts (the new convention).
// This file is kept to avoid confusion during migration.

export function middleware() {
  // No-op — all logic moved to proxy.ts
}

export const config = {
  matcher: [],
};
