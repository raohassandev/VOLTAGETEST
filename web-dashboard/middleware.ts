// Next.js requires middleware to live in middleware.ts.
// Logic lives in proxy.ts (edge-runtime compatible, no bcrypt/prisma).
export { proxy as middleware, config } from "./proxy";
