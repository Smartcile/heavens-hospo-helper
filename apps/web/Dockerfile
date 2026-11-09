# syntax=docker/dockerfile:1.7

# ── base ─────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl ffmpeg
WORKDIR /app

# ── dependencies ─────────────────────────────────────────────────────────────
# Copy only the manifests first so this layer is reused until a lockfile or a
# workspace manifest changes.
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/config/package.json packages/config/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps

# ── build ────────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN cd packages/db && npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,target=/app/apps/web/.next/cache \
    cd apps/web && npm run build

# Drop build/test-only dependencies and the Next build cache. `prisma` and
# `tsx` are runtime dependencies of the DB package because the entrypoint runs
# db push + the migration/seed scripts on every boot.
RUN npm prune --omit=dev --legacy-peer-deps \
    && rm -rf apps/web/.next/cache apps/web/.next/trace

# ── runtime ──────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
WORKDIR /app
COPY --from=builder /app ./
RUN chmod +x apps/web/docker-entrypoint.sh
EXPOSE 3000
CMD ["sh", "/app/apps/web/docker-entrypoint.sh"]
