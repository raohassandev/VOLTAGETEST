// Next.js requires config to be statically analyzable in middleware.ts — cannot re-export.
// Session verification logic lives in proxy.ts.
import { proxy } from "./proxy";

export const middleware = proxy;

export const config = {
  matcher: ["/((?!welcome|api|_next|favicon.ico|brand).*)"],
};
