#!/bin/sh
set -e

echo ""
echo "============================================"
echo "  HOSPO OPS — STARTING"
echo "============================================"

echo ""
echo "▸ Regenerating Prisma Client..."
cd /app
npx prisma generate --schema=packages/db/prisma/schema.prisma

echo ""
echo "▸ Running budget allocation migration (pre-sync)..."
cd /app/packages/db
npm run db:migrate-budget || echo "⚠ Budget migration step failed (see error above) — continuing to start the app."

echo ""
echo "▸ Syncing database schema..."
cd /app
# db push reconciles the DB to match schema.prisma on every boot. Unlike
# `migrate deploy` it keeps no migration history, so it can't get stuck in a
# failed-migration (P3009) state and crash-loop the container — it just makes
# the schema correct. Idempotent: on an up-to-date DB it's a no-op.
#
# Fast path: --accept-data-loss (catches in-sync or near-sync DBs).
# Fallback:  --force-reset when --accept-data-loss fails (handles one-time
#            old-schema transition on production DBs with 60 incompatible
#            BudgetDayAllocation rows). The seed is idempotent and repopulates
#            budget data. After one force-reset, subsequent deploys use the
#            fast path.
npx prisma db push --schema=packages/db/prisma/schema.prisma --accept-data-loss --url="$DATABASE_URL" || {
  echo ""
  echo "⚠ db push --accept-data-loss failed — likely old table structure."
  echo "▸ Falling back to --force-reset (drops and recreates all tables)..."
  echo "  Budget data will be re-populated by the seed script."
  npx prisma db push --schema=packages/db/prisma/schema.prisma --force-reset --url="$DATABASE_URL" || exit 1
  echo "✓ Force-reset successful."
}

echo ""
echo "▸ Running furniture unification migration (post-sync)..."
# Must run AFTER db push: it reads the deprecated TableProfile tables, which
# only exist because they are still declared in schema.prisma. Idempotent.
cd /app/packages/db
npm run db:migrate-furniture || echo "⚠ Furniture migration step failed (see error above) — continuing to start the app."

echo ""
echo "▸ Backfilling UOM kinds + ingredient densities (post-sync)..."
# Kind on UnitOfMeasure (VOLUME/MASS/COUNT) + the known-ingredient density
# library. Reads only the new columns/tables created by db push. Idempotent.
npm run db:migrate-uom || echo "⚠ UOM migration step failed (see error above) — continuing to start the app."

echo ""
echo "▸ Recovering guide step links + guide audiences (post-sync)..."
# Also must run AFTER db push. migrate-step-links reads the deprecated
# TrainingStep junctions to rebuild links that migrate-to-guides had to drop.
# Both are idempotent.
npm run db:migrate-step-links || echo "⚠ Step-link recovery failed (see error above) — continuing to start the app."
npm run db:backfill-guide-audiences || echo "⚠ Guide audience backfill failed (see error above) — continuing to start the app."

echo ""
echo "▸ Seeding database (safe to re-run)..."
cd /app/packages/db
npm run db:seed || echo "⚠ Seed step failed (see error above) — continuing to start the app."

echo ""
echo "▸ Starting Next.js on 0.0.0.0:${PORT:-3000}..."
cd /app/apps/web
exec npx next start -H 0.0.0.0 -p ${PORT:-3000}
