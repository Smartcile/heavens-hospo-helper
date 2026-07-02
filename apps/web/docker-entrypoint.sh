#!/bin/sh
set -e

echo ""
echo "============================================"
echo "  HOSPO OPS — STARTING"
echo "============================================"

echo ""
echo "▸ Syncing database schema..."
cd /app
# db push reconciles the DB to match schema.prisma on every boot. Unlike
# `migrate deploy` it keeps no migration history, so it can't get stuck in a
# failed-migration (P3009) state and crash-loop the container — it just makes
# the schema correct. Idempotent: on an up-to-date DB it's a no-op.
npx prisma db push --schema=packages/db/prisma/schema.prisma --accept-data-loss --skip-generate

echo ""
echo "▸ Regenerating Prisma Client..."
npx prisma generate --schema=packages/db/prisma/schema.prisma

echo ""
echo "▸ Running budget allocation migration..."
cd /app/packages/db
npm run db:migrate-budget || echo "⚠ Budget migration step failed (see error above) — continuing to start the app."

echo ""
echo "▸ Seeding database (safe to re-run)..."
cd /app/packages/db
npm run db:seed || echo "⚠ Seed step failed (see error above) — continuing to start the app."

echo ""
echo "▸ Starting Next.js on 0.0.0.0:${PORT:-3000}..."
cd /app/apps/web
exec npx next start -H 0.0.0.0 -p ${PORT:-3000}
