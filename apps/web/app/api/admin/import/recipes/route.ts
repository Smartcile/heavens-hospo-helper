import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { normaliseImportKey } from '@/lib/import/similarity'
import {
  unitKindMismatch,
  type RecipeImportItemRef,
  type RecipeImportPantryRef,
  type RecipeImportRecipeRef,
  type RecipeImportUomRef,
  type RecipeLineTarget,
} from '@/lib/import/recipe'
import type { ImportRowAction, ImportSummary } from '@/lib/import/types'

const MAX_ROWS = 400
const PREP_ONLY_NOTE = 'RECIPES ARE PREP/BOM ONLY - NO MENU ITEM IS CREATED'

type Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

interface RawLine { target?: unknown; name?: unknown; qty?: unknown; uom?: unknown }
interface RawValues {
  name?: unknown
  yieldQty?: unknown
  yieldUnit?: unknown
  prepTime?: unknown
  instructions?: unknown
  lines?: unknown
  replaceLines?: unknown
}
interface RawRow { action?: ImportRowAction; targetId?: string; values?: RawValues }

interface Refs {
  items: Map<string, RecipeImportItemRef[]>
  recipes: Map<string, RecipeImportRecipeRef[]>
  pantry: Map<string, RecipeImportPantryRef[]>
  uoms: RecipeImportUomRef[]
  uomByName: Map<string, RecipeImportUomRef>
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[^0-9.\-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function pushTo<T extends { name: string }>(map: Map<string, T[]>, row: T) {
  const key = normaliseImportKey(row.name)
  const list = map.get(key) ?? []
  list.push(row)
  map.set(key, list)
}

async function loadRefs(tx: Tx, venueId: string): Promise<Refs> {
  // Sequential awaits: this also runs inside an interactive transaction, where
  // parallel tx queries are best avoided.
  const items = await tx.inventoryItem.findMany({
    where: { venueId, deletedAt: null },
    select: { id: true, name: true, unit: true, densityGramsPerMl: true, weightPerUnitGrams: true },
    orderBy: { name: 'asc' },
  })
  const recipes = await tx.recipe.findMany({
    where: { venueId, deletedAt: null },
    select: { id: true, name: true, yieldUnit: { select: { kind: true } } },
    orderBy: { name: 'asc' },
  })
  const pantryRows = await tx.ingredientReference.findMany({
    where: { deletedAt: null, OR: [{ venueId }, { venueId: null }] },
    select: { id: true, name: true, venueId: true },
    orderBy: { name: 'asc' },
  })
  const uomRows = await tx.unitOfMeasure.findMany({
    where: { deletedAt: null, OR: [{ venueId }, { venueId: null }] },
    select: { id: true, name: true, baseUnit: true, conversionRatio: true, kind: true, venueId: true },
    orderBy: { name: 'asc' },
  })

  const itemsMap = new Map<string, RecipeImportItemRef[]>()
  for (const item of items) pushTo(itemsMap, item)

  const recipesMap = new Map<string, RecipeImportRecipeRef[]>()
  for (const recipe of recipes) {
    pushTo(recipesMap, { id: recipe.id, name: recipe.name, yieldUnitKind: recipe.yieldUnit?.kind ?? null })
  }

  // Pantry is knowledge, not stock: venue rows override the global ones by name.
  const pantryMap = new Map<string, RecipeImportPantryRef[]>()
  const pantryByName = new Map<string, RecipeImportPantryRef>()
  for (const row of pantryRows) if (row.venueId === null) pantryByName.set(normaliseImportKey(row.name), { id: row.id, name: row.name })
  for (const row of pantryRows) if (row.venueId === venueId) pantryByName.set(normaliseImportKey(row.name), { id: row.id, name: row.name })
  for (const row of pantryByName.values()) pushTo(pantryMap, row)

  // Venue-specific units override global built-ins that share a name.
  const uomByName = new Map<string, RecipeImportUomRef>()
  for (const uom of uomRows) {
    if (uom.venueId !== null) continue
    uomByName.set(normaliseImportKey(uom.name), {
      id: uom.id, name: uom.name, baseUnit: uom.baseUnit, conversionRatio: uom.conversionRatio, kind: uom.kind,
    })
  }
  for (const uom of uomRows) {
    if (uom.venueId !== venueId) continue
    uomByName.set(normaliseImportKey(uom.name), {
      id: uom.id, name: uom.name, baseUnit: uom.baseUnit, conversionRatio: uom.conversionRatio, kind: uom.kind,
    })
  }

  return { items: itemsMap, recipes: recipesMap, pantry: pantryMap, uoms: [...uomByName.values()], uomByName }
}

function pickOne<T>(map: Map<string, T[]>, name: string): T | 'AMBIGUOUS' | null {
  const matches = map.get(normaliseImportKey(name)) ?? []
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) return 'AMBIGUOUS'
  return null
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.recipes.view')
  if (denied) return denied

  const venueId = session.user.role === 'MANAGER'
    ? session.user.venueId
    : req.nextUrl.searchParams.get('venueId') || session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const refs = await loadRefs(prisma as Tx, venueId)
  return NextResponse.json({
    recipes: [...refs.recipes.values()].flat(),
    items: [...refs.items.values()].flat(),
    uoms: refs.uoms,
    pantry: [...refs.pantry.values()].flat(),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const deniedCreate = await guardAccess(session, req, 'ops.recipes.create')
  if (deniedCreate) return deniedCreate

  const body = await req.json().catch(() => null) as { venueId?: string; rows?: RawRow[] } | null
  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : body?.venueId || session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!Array.isArray(body?.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: 'NO ROWS TO IMPORT' }, { status: 400 })
  }
  if (body.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `TOO MANY ROWS - MAX ${MAX_ROWS}` }, { status: 400 })
  }

  const touchesExisting = body.rows.some((row) => row.action === 'UPDATE' || row.action === 'REVIVE')
  if (touchesExisting) {
    const deniedEdit = await guardAccess(session, req, 'ops.recipes.edit')
    if (deniedEdit) return deniedEdit
  }

  try {
    const summary = await prisma.$transaction(async (tx): Promise<ImportSummary> => {
      const out: ImportSummary = { created: 0, updated: 0, revived: 0, skipped: 0, warnings: [PREP_ONLY_NOTE] }
      const refs = await loadRefs(tx, venueId)

      for (const raw of body.rows ?? []) {
        const values = (raw.values ?? {}) as RawValues
        const name = normaliseImportKey(values.name)
        if (!name) { out.skipped++; continue }
        const action = raw.action ?? 'CREATE'
        if (action === 'SKIP') { out.skipped++; continue }

        const yieldQty = toNumber(values.yieldQty) ?? 1
        const prepTime = toNumber(values.prepTime)
        const instructions = typeof values.instructions === 'string' && values.instructions.trim()
          ? values.instructions.trim()
          : null

        const yieldUom = values.yieldUnit ? refs.uomByName.get(normaliseImportKey(values.yieldUnit)) : undefined
        if (!yieldUom) {
          out.skipped++
          out.warnings.push(`"${name}" SKIPPED - YIELD UNIT "${String(values.yieldUnit ?? '')}" NOT FOUND`)
          continue
        }

        const rawLines = Array.isArray(values.lines) ? (values.lines as RawLine[]) : []
        const lineData: {
          qty: number
          uomId: string
          inventoryItemId: string | null
          childRecipeId: string | null
          ingredientReferenceId: string | null
          sortOrder: number
        }[] = []
        let lineError: string | null = null

        for (const [index, line] of rawLines.entries()) {
          const target = String(line.target ?? 'ITEM').toUpperCase() as RecipeLineTarget
          const lineName = normaliseImportKey(line.name)
          const qty = toNumber(line.qty)
          const uom = line.uom ? refs.uomByName.get(normaliseImportKey(line.uom)) : undefined

          if (!lineName) { lineError = `A LINE HAS NO NAME`; break }
          if (qty == null || qty <= 0) { lineError = `LINE "${lineName}" HAS NO VALID QUANTITY`; break }
          if (!uom) { lineError = `UNIT "${String(line.uom ?? '')}" FOR "${lineName}" NOT FOUND`; break }

          if (target === 'ITEM') {
            const item = pickOne(refs.items, lineName)
            if (item === 'AMBIGUOUS') { lineError = `LINE "${lineName}" MATCHES MULTIPLE INVENTORY ITEMS`; break }
            if (!item) { lineError = `LINE "${lineName}" NOT FOUND IN INVENTORY`; break }
            const mismatch = unitKindMismatch({ target, uom, item, uoms: refs.uoms })
            if (mismatch) { lineError = mismatch; break }
            lineData.push({ qty, uomId: uom.id, inventoryItemId: item.id, childRecipeId: null, ingredientReferenceId: null, sortOrder: index })
          } else if (target === 'RECIPE') {
            const recipe = pickOne(refs.recipes, lineName)
            if (recipe === 'AMBIGUOUS') { lineError = `LINE "${lineName}" MATCHES MULTIPLE RECIPES`; break }
            if (!recipe) { lineError = `LINE "${lineName}" NOT FOUND IN RECIPES`; break }
            const mismatch = unitKindMismatch({ target, uom, recipe, uoms: refs.uoms })
            if (mismatch) { lineError = mismatch; break }
            lineData.push({ qty, uomId: uom.id, inventoryItemId: null, childRecipeId: recipe.id, ingredientReferenceId: null, sortOrder: index })
          } else if (target === 'PANTRY') {
            const ref = pickOne(refs.pantry, lineName)
            if (ref === 'AMBIGUOUS') { lineError = `LINE "${lineName}" MATCHES MULTIPLE PANTRY ENTRIES`; break }
            if (!ref) { lineError = `LINE "${lineName}" NOT FOUND IN PANTRY BIBLE`; break }
            lineData.push({ qty, uomId: uom.id, inventoryItemId: null, childRecipeId: null, ingredientReferenceId: ref.id, sortOrder: index })
          } else {
            lineError = `UNKNOWN TARGET "${String(line.target ?? '')}"`
            break
          }
        }

        if (lineError) {
          out.skipped++
          out.warnings.push(`"${name}" SKIPPED - ${lineError}`)
          continue
        }

        const target = raw.targetId
          ? await tx.recipe.findFirst({ where: { id: raw.targetId, venueId }, select: { id: true } })
          : null
        if (raw.targetId && !target) {
          out.skipped++
          out.warnings.push(`"${name}" TARGET NOT FOUND - SKIPPED`)
          continue
        }

        if (target && (action === 'UPDATE' || action === 'REVIVE')) {
          await tx.recipe.update({
            where: { id: target.id },
            data: {
              name,
              yieldQty: yieldQty > 0 ? yieldQty : 1,
              yieldUnitId: yieldUom.id,
              instructions,
              prepTime: prepTime != null ? Math.max(0, Math.trunc(prepTime)) : null,
              ...(action === 'REVIVE' ? { deletedAt: null } : {}),
            },
          })
          // RecipeLineItem has no deletedAt — only rewrite it when the operator
          // explicitly ticked REPLACE LINES.
          if (values.replaceLines === true) {
            await tx.recipeLineItem.deleteMany({ where: { recipeId: target.id } })
            if (lineData.length > 0) {
              await tx.recipeLineItem.createMany({ data: lineData.map((line) => ({ ...line, recipeId: target.id })) })
            }
          }
          if (action === 'REVIVE') out.revived++
          else out.updated++
          continue
        }

        const existing = await tx.recipe.findFirst({
          where: { venueId, name, deletedAt: null },
          select: { id: true },
        })
        if (existing) {
          out.skipped++
          out.warnings.push(`"${name}" ALREADY EXISTS - SKIPPED (CHOOSE UPDATE TO OVERWRITE)`)
          continue
        }

        await tx.recipe.create({
          data: {
            venueId,
            name,
            yieldQty: yieldQty > 0 ? yieldQty : 1,
            yieldUnitId: yieldUom.id,
            instructions,
            prepTime: prepTime != null ? Math.max(0, Math.trunc(prepTime)) : null,
            lineItems: lineData.length > 0 ? { create: lineData } : undefined,
          },
        })
        out.created++
      }

      return out
    })

    return NextResponse.json(summary)
  } catch (e) {
    console.error('recipe import failed', e)
    return NextResponse.json({ error: 'IMPORT FAILED' }, { status: 500 })
  }
}
