/**
 * Backfills `UnitOfMeasure.kind` (VOLUME / MASS / COUNT) from the free-text
 * `baseUnit`, ensures the extended built-in UOM presets exist (CUP, TABLESPOON,
 * TEASPOON, PINT, OUNCE, POUND — metric volumes), and seeds the known-ingredient
 * density library (`IngredientReference`, global venueId-null rows).
 *
 * Must run AFTER `prisma db push` (the `kind` column and tables are created by
 * the push). Idempotent — kinds are only set when still COUNT-with-no-data,
 * presets upsert by name, references upsert by name — so it is safe to run on
 * every boot and safe to re-run after a partial failure.
 *
 *   npm run db:migrate-uom
 */

import { prisma } from '../index'
import { INGREDIENT_REFERENCES } from './ingredient-reference-data'

type Kind = 'VOLUME' | 'MASS' | 'COUNT'

// Canonical base units per kind. A UOM whose baseUnit starts with one of these
// gets that kind; everything else (ea, set, case, bunch...) is COUNT.
const BASE_TO_KIND: { prefixes: string[]; kind: Kind }[] = [
  { prefixes: ['ml', 'l', 'litre'], kind: 'VOLUME' },
  { prefixes: ['g', 'kg', 'gram'], kind: 'MASS' },
]

// Metric-volume built-ins added beyond the original list. conversionRatio is
// in the canonical base unit (mL / g / ea).
const PRESETS: { name: string; baseUnit: string; conversionRatio: number; kind: Kind }[] = [
  { name: 'CUP', baseUnit: 'mL', conversionRatio: 250, kind: 'VOLUME' },
  { name: 'TABLESPOON', baseUnit: 'mL', conversionRatio: 20, kind: 'VOLUME' },
  { name: 'TEASPOON', baseUnit: 'mL', conversionRatio: 5, kind: 'VOLUME' },
  { name: 'PINT', baseUnit: 'mL', conversionRatio: 570, kind: 'VOLUME' },
  { name: 'OUNCE', baseUnit: 'g', conversionRatio: 28.35, kind: 'MASS' },
  { name: 'POUND', baseUnit: 'g', conversionRatio: 453.6, kind: 'MASS' },
]

async function main() {
  // ── 1. Backfill kinds on existing rows ────────────────────────────────
  const uoms = await prisma.unitOfMeasure.findMany({
    where: { deletedAt: null },
    select: { id: true, baseUnit: true, kind: true },
  })

  let kinded = 0
  for (const u of uoms) {
    const base = u.baseUnit.toLowerCase().trim()
    const match = BASE_TO_KIND.find((b) => b.prefixes.some((p) => base.startsWith(p)))
    const target: Kind = match?.kind ?? 'COUNT'
    if (u.kind !== target) {
      // kind defaults to COUNT, so a VOLUME/MASS row that still reads COUNT
      // needs the backfill. Rows whose COUNT is intentional are untouched.
      await prisma.unitOfMeasure.update({ where: { id: u.id }, data: { kind: target } })
      kinded++
    }
  }
  console.log(`[uom] backfilled kind on ${kinded} units of measure`)

  // ── 2. Ensure extended built-in presets exist ─────────────────────────
  let createdPresets = 0
  for (const p of PRESETS) {
    const existing = await prisma.unitOfMeasure.findFirst({
      where: { name: p.name, venueId: null, deletedAt: null },
    })
    if (!existing) {
      await prisma.unitOfMeasure.create({
        data: { ...p, isBuiltIn: true, venueId: null },
      })
      createdPresets++
    } else if (existing.kind !== p.kind || existing.conversionRatio !== p.conversionRatio) {
      await prisma.unitOfMeasure.update({
        where: { id: existing.id },
        data: { kind: p.kind, baseUnit: p.baseUnit, conversionRatio: p.conversionRatio },
      })
    }
  }
  console.log(`[uom] ensured ${PRESETS.length} built-in presets (${createdPresets} created)`)

  // ── 3. Seed the known-ingredient density library ──────────────────────
  let seededRefs = 0
  for (const ref of INGREDIENT_REFERENCES) {
    const existing = await prisma.ingredientReference.findFirst({
      where: { name: ref.name, venueId: null, deletedAt: null },
    })
    if (existing) {
      await prisma.ingredientReference.update({
        where: { id: existing.id },
        data: {
          densityGramsPerMl: ref.densityGramsPerMl ?? null,
          weightPerUnitGrams: ref.weightPerUnitGrams ?? null,
          notes: ref.notes ?? null,
          isBuiltIn: true,
        },
      })
    } else {
      await prisma.ingredientReference.create({
        data: {
          name: ref.name,
          densityGramsPerMl: ref.densityGramsPerMl ?? null,
          weightPerUnitGrams: ref.weightPerUnitGrams ?? null,
          notes: ref.notes ?? null,
          isBuiltIn: true,
          venueId: null,
        },
      })
      seededRefs++
    }
  }
  console.log(`[uom] ${INGREDIENT_REFERENCES.length} ingredient references ensured (${seededRefs} created)`)
}

main()
  .catch((e) => {
    console.error('[uom] failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
