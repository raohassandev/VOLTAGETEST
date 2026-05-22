FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
RUN npm run db:generate && npm run build

# Use Next.js standalone output — bundles only what the server needs.
# next.config.ts sets output: "standalone".
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Standalone server + static assets + prisma schema for migrations
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
# Prisma CLI needed for `migrate deploy` at startup
COPY --from=deps /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma

EXPOSE 3000
CMD sh -c "node_modules/.bin/prisma migrate deploy && node server.js"
