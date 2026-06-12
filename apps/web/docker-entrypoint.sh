#!/bin/sh
set -e

echo ""
echo "============================================"
echo "  HOSPO OPS — STARTING"
echo "============================================"

echo ""
echo "▸ Running database migrations..."
cd /app
npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma

echo ""
echo "▸ Seeding database (safe to re-run)..."
cd /app/packages/db
npm run db:seed || echo "⚠ Seed step failed (see error above) — continuing to start the app."

echo ""
echo "▸ Starting Next.js on 0.0.0.0:${PORT:-3000}..."
cd /app/apps/web
exec npx next start -H 0.0.0.0 -p ${PORT:-3000}
