FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
RUN npm run db:generate && npm run build

# Use Next.js standalone output — bundles only what the server needs.
# next.config.ts sets output: "standalone".
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Prisma schema engine requires OpenSSL/libssl on Alpine
RUN apk add --no-cache openssl

# Standalone server + static assets + prisma schema for migrations
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
# Prisma CLI + WASM schema engine needed for `migrate deploy` at startup.
# Note: COPY dereferences symlinks, so we invoke prisma via its real build path
# (node_modules/prisma/build/index.js) so __dirname resolves correctly for the WASM.
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma

EXPOSE 3000
# HOSTNAME=0.0.0.0 makes Next.js standalone listen on all interfaces (required for health check via localhost)
ENV HOSTNAME=0.0.0.0
CMD sh -c "node node_modules/prisma/build/index.js migrate deploy && node server.js"
