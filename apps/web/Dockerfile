FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Dependencies stage
FROM base AS deps
COPY package.json turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
RUN npm install --legacy-peer-deps

# Prisma generate
FROM deps AS prisma
COPY packages/db/prisma ./packages/db/prisma
RUN cd packages/db && npx prisma generate

# Builder stage
FROM prisma AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build --workspace=apps/web

# Runner stage
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
