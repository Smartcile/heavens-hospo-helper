// Recipe importer adapter (PR 2 of #89). Pure — no Prisma imports — so the
// preview can map names to the venue's existing records in the browser and the
// route can re-validate the same names against the database.
//
// A recipe line points at exactly one target:
//   ITEM    — a stock InventoryItem
//   RECIPE  — another recipe (sub-recipe)
//   PANTRY  — a Pantry Bible IngredientReference (knowledge, not stock)
// Names are the contract. An unknown name is a row ERROR ("MAP OR SKIP"),
// never invented.

import { extractJsonBlock, normaliseMenuName } from '@/lib/menu-import'
import {
  allowedKinds,
  resolveItemKind,
  uomKind,
  type KindedItemLike,
  type UomLike,
} from '@/lib/unit-convert'
import { findSimilar, normaliseImportKey } from './similarity'
import type { ImportExisting, ImportIssue, ImportParseResult, ImportRow } from './types'

export type RecipeLineTarget = 'ITEM' | 'RECIPE' | 'PANTRY'

export interface RecipeImportLine {
  target: RecipeLineTarget
  name: string
  qty: number
  uom: string
}

export interface RecipeImportValues {
  name: string
  yieldQty: number
  yieldUnit: string
  prepTime: number | null
  instructions: string | null
  lines: RecipeImportLine[]
  /** Explicit per-row gate: only rewrite RecipeLineItem rows when true. */
  replaceLines: boolean
}

export interface RecipeImportItemRef {
  id: string
  name: string
  unit: string
  densityGramsPerMl?: number | null
  weightPerUnitGrams?: number | null
}

export interface RecipeImportRecipeRef {
  id: string
  name: string
  yieldUnitKind?: string | null
}

export interface RecipeImportUomRef {
  id: string
  name: string
  baseUnit?: string
  conversionRatio?: number
  kind?: string | null
}

export interface RecipeImportPantryRef {
  id: string
  name: string
}

export interface RecipeImportRefs {
  items: RecipeImportItemRef[]
  recipes: RecipeImportRecipeRef[]
  uoms: RecipeImportUomRef[]
  pantry: RecipeImportPantryRef[]
}

export function buildRecipeImportPrompt({ venueName }: { venueName?: string } = {}): string {
  const venue = venueName?.trim() ? ` for ${venueName.trim()}` : ''
  return [
    `I'm importing recipes${venue} into a hospitality system.`,
    `Read the attached document (PDF, photo or text) and return STRICT JSON in one fenced \`\`\`json block.`,
    `Do not add commentary outside the block.`,
    ``,
    `JSON shape:`,
    `{`,
    `  "recipes": [`,
    `    {`,
    `      "name": "RECIPE NAME",`,
    `      "yieldQty": 4,`,
    `      "yieldUnit": "PORTION",`,
    `      "prepTime": 90,`,
    `      "instructions": "1. ...\\n2. ...",`,
    `      "lines": [`,
    `        { "target": "ITEM", "name": "CHICKEN WHOLE", "qty": 1.5, "uom": "KG" }`,
    `      ]`,
    `    }`,
    `  ]`,
    `}`,
    ``,
    `Rules:`,
    `- Keep recipe and ingredient names UPPERCASE.`,
    `- target is ITEM (a stock inventory item), RECIPE (another recipe) or PANTRY (a Pantry Bible reference).`,
    `- name must be the existing record's name as written. Never invent items, recipes, pantry entries or units.`,
    `- qty is a decimal number; uom is the unit NAME used by the system (G, KG, ML, L, EA, CUP, TBSP...).`,
    `- yieldQty and yieldUnit describe what the whole recipe makes (e.g. 4 PORTION).`,
    `- prepTime is minutes, or null. instructions is plain text, or null.`,
    `- One row per recipe. If a value is unknown, use null rather than guessing.`,
  ].join('\n')
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[^0-9.\-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function normaliseTarget(value: unknown): { target: RecipeLineTarget; invalid: boolean } {
  const raw = String(value ?? '').trim().toUpperCase()
  if (raw === 'ITEM' || raw === 'RECIPE' || raw === 'PANTRY') return { target: raw, invalid: false }
  return { target: 'ITEM', invalid: raw.length > 0 }
}

function normaliseLine(raw: unknown, rowId: string): { line: RecipeImportLine | null; issues: ImportIssue[] } {
  const issues: ImportIssue[] = []
  if (!raw || typeof raw !== 'object') {
    return { line: null, issues: [{ code: 'LINE_INVALID', severity: 'ERROR', rowId, message: 'IGNORED A LINE THAT WAS NOT AN OBJECT' }] }
  }
  const source = raw as Record<string, unknown>
  const name = normaliseMenuName(source.name ?? source.ingredient ?? source.item)
  const { target, invalid } = normaliseTarget(source.target ?? source.kind)
  const qty = toNumber(source.qty ?? source.quantity ?? source.amount)
  const uom = String(source.uom ?? source.unit ?? '').trim().toUpperCase()

  if (invalid) {
    issues.push({ code: 'TARGET_INVALID', severity: 'WARNING', rowId, message: `UNKNOWN TARGET ON "${name || 'LINE'}" - ASSUMED ITEM` })
  }
  if (!name) {
    issues.push({ code: 'LINE_NAME_MISSING', severity: 'ERROR', rowId, message: 'A LINE HAS NO NAME' })
  }
  if (qty == null || qty <= 0) {
    issues.push({ code: 'LINE_QTY_MISSING', severity: 'ERROR', rowId, message: `"${name || 'LINE'}" HAS NO VALID QUANTITY` })
  }
  if (!uom) {
    issues.push({ code: 'LINE_UOM_MISSING', severity: 'ERROR', rowId, message: `"${name || 'LINE'}" HAS NO UNIT` })
  }

  return {
    line: { target, name, qty: qty != null && qty > 0 ? qty : 0, uom },
    issues,
  }
}

/** Parse a pasted LLM answer into recipe rows. Does not resolve names. */
export function parseRecipeImportAnswer(raw: string): ImportParseResult<RecipeImportValues> | { error: string } {
  const json = extractJsonBlock(raw)
  if (!json) return { error: 'NO JSON FOUND IN THE ANSWER' }

  let root: Record<string, unknown>
  try {
    root = JSON.parse(json) as Record<string, unknown>
  } catch {
    return { error: 'THE ANSWER IS NOT VALID JSON' }
  }

  const list = Array.isArray(root.recipes)
    ? root.recipes
    : Array.isArray(root.items)
      ? root.items
      : null
  if (!list) return { error: 'NO RECIPES FOUND IN THE ANSWER' }

  const rows: ImportRow<RecipeImportValues>[] = []
  const issues: ImportIssue[] = []
  const seen = new Map<string, string>()

  list.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return
    const source = entry as Record<string, unknown>
    const name = normaliseMenuName(source.name ?? source.title)
    if (!name) {
      issues.push({ code: 'RECIPE_NAME_MISSING', severity: 'ERROR', message: `RECIPE #${index + 1} HAS NO NAME - SKIPPED` })
      return
    }

    const id = `r${index}`
    const rowIssues: ImportIssue[] = []
    const key = normaliseImportKey(name)
    const duplicateOf = seen.get(key)
    if (!duplicateOf) seen.set(key, id)

    const yieldQty = toNumber(source.yieldQty ?? source.yield ?? source.quantity) ?? 1
    const yieldUnit = String(source.yieldUnit ?? source.unit ?? '').trim().toUpperCase()
    const prepTime = toNumber(source.prepTime ?? source.prepMinutes)
    const instructions = typeof source.instructions === 'string' && source.instructions.trim()
      ? source.instructions.trim()
      : null

    if (!yieldUnit) {
      rowIssues.push({ code: 'YIELD_UNIT_MISSING', severity: 'ERROR', rowId: id, message: `"${name}" HAS NO YIELD UNIT` })
    }

    const rawLines = Array.isArray(source.lines) ? source.lines : Array.isArray(source.ingredients) ? source.ingredients : []
    const lines: RecipeImportLine[] = []
    for (const rawLine of rawLines) {
      const parsedLine = normaliseLine(rawLine, id)
      if (parsedLine.line) lines.push(parsedLine.line)
      rowIssues.push(...parsedLine.issues)
    }

    if (duplicateOf) {
      rowIssues.push({ code: 'DUPLICATE_IN_FILE', severity: 'WARNING', rowId: id, message: `DUPLICATE "${name}" - ONLY THE FIRST IS KEPT` })
    }

    rows.push({
      id,
      values: {
        name,
        yieldQty: yieldQty > 0 ? yieldQty : 1,
        yieldUnit,
        prepTime: prepTime != null ? Math.max(0, Math.trunc(prepTime)) : null,
        instructions,
        lines,
        replaceLines: false,
      },
      include: !duplicateOf,
      action: duplicateOf ? 'SKIP' : 'CREATE',
      match: duplicateOf ? { status: 'DUPLICATE_IN_FILE', label: duplicateOf } : { status: 'NEW' },
      issues: rowIssues,
    })
  })

  if (rows.length === 0) return { error: 'NO RECIPES FOUND IN THE ANSWER' }
  return { rows, issues }
}

/** Exact / in-file / similar matching against existing recipes. */
export function matchRecipeRows(
  rows: ImportRow<RecipeImportValues>[],
  existing: ImportExisting[],
): ImportRow<RecipeImportValues>[] {
  const byKey = new Map<string, ImportExisting[]>()
  for (const row of existing) {
    const key = normaliseImportKey(row.name)
    const list = byKey.get(key) ?? []
    list.push(row)
    byKey.set(key, list)
  }

  return rows.map((row) => {
    if (row.match?.status === 'DUPLICATE_IN_FILE') return row
    const key = normaliseImportKey(row.values.name)
    const exact = byKey.get(key) ?? []
    if (exact.length === 1) {
      const target = exact[0]
      return {
        ...row,
        action: 'SKIP',
        include: false,
        match: { status: 'MATCH', targetId: target.id, label: target.name, deleted: !!target.deletedAt },
      }
    }
    if (exact.length > 1) {
      return {
        ...row,
        action: 'SKIP',
        include: false,
        match: { status: 'AMBIGUOUS', label: `${exact.length} EXISTING RECIPES` },
        issues: [...row.issues, { code: 'AMBIGUOUS_NAME', severity: 'ERROR', message: `"${row.values.name}" MATCHES ${exact.length} RECIPES - RENAME OR SKIP` }],
      }
    }
    const similar = findSimilar(row.values.name, existing)
    if (similar) {
      return {
        ...row,
        action: 'SKIP',
        include: false,
        match: {
          status: 'SIMILAR',
          targetId: similar.target.id,
          label: similar.target.name,
          score: similar.score,
          deleted: !!similar.target.deletedAt,
        },
      }
    }
    return row
  })
}

function findExact<T extends { name: string }>(name: string, list: T[]): T | 'AMBIGUOUS' | null {
  const key = normaliseImportKey(name)
  const matches = list.filter((row) => normaliseImportKey(row.name) === key)
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) return 'AMBIGUOUS'
  return null
}

function findUom(name: string, uoms: RecipeImportUomRef[]): RecipeImportUomRef | null {
  const key = normaliseImportKey(name)
  return uoms.find((uom) => normaliseImportKey(uom.name) === key) ?? null
}

function toUomLike(uom: RecipeImportUomRef): UomLike {
  return {
    id: uom.id,
    name: uom.name,
    baseUnit: uom.baseUnit ?? '',
    conversionRatio: uom.conversionRatio ?? 1,
    kind: uom.kind ?? null,
  }
}

/**
 * Pure unit-dimension check shared by the preview and the import route:
 * a VOLUME unit on a COUNT item is an error unless a density bridge exists.
 */
export function unitKindMismatch(args: {
  target: RecipeLineTarget
  uom: RecipeImportUomRef
  item?: RecipeImportItemRef | null
  recipe?: RecipeImportRecipeRef | null
  uoms: RecipeImportUomRef[]
}): string | null {
  if (args.target === 'PANTRY') return null
  const uom = toUomLike(args.uom)

  let target: KindedItemLike | null = null
  if (args.target === 'ITEM') {
    if (!args.item) return null
    target = {
      kind: resolveItemKind(args.item.unit, args.uoms.map(toUomLike)),
      densityGramsPerMl: args.item.densityGramsPerMl ?? null,
      weightPerUnitGrams: args.item.weightPerUnitGrams ?? null,
    }
  } else {
    if (!args.recipe) return null
    target = { kind: args.recipe.yieldUnitKind ?? null }
  }

  if (!allowedKinds(target).has(uomKind(uom))) {
    return `UNIT MISMATCH ON "${args.item?.name ?? args.recipe?.name ?? 'LINE'}" - "${uom.name}" IS ${uomKind(uom)}`
  }
  return null
}

function lineKindError(line: RecipeImportLine, refs: RecipeImportRefs): string | null {
  if (line.target === 'PANTRY') return null
  const uom = findUom(line.uom, refs.uoms)
  if (!uom) return null

  if (line.target === 'ITEM') {
    const item = findExact(line.name, refs.items)
    if (!item || item === 'AMBIGUOUS') return null
    return unitKindMismatch({ target: 'ITEM', uom, item, uoms: refs.uoms })
  }
  const recipe = findExact(line.name, refs.recipes)
  if (!recipe || recipe === 'AMBIGUOUS') return null
  return unitKindMismatch({ target: 'RECIPE', uom, recipe, uoms: refs.uoms })
}

/**
 * Resolve every name against the venue's existing records. Unknown targets /
 * units become row ERRORs and the row defaults to SKIP (never invented).
 */
export function resolveRecipeImportRefs(
  rows: ImportRow<RecipeImportValues>[],
  refs: RecipeImportRefs,
): ImportRow<RecipeImportValues>[] {
  return rows.map((row) => {
    const issues: ImportIssue[] = [...row.issues]

    if (!findUom(row.values.yieldUnit, refs.uoms)) {
      issues.push({ code: 'YIELD_UNIT_NOT_FOUND', severity: 'ERROR', rowId: row.id, field: 'yieldUnit', message: `YIELD UNIT "${row.values.yieldUnit}" NOT FOUND - MAP OR SKIP` })
    }

    for (const line of row.values.lines) {
      const found = line.target === 'ITEM'
        ? findExact(line.name, refs.items)
        : line.target === 'RECIPE'
          ? findExact(line.name, refs.recipes)
          : findExact(line.name, refs.pantry)
      const label = line.target === 'ITEM' ? 'INVENTORY ITEM' : line.target === 'RECIPE' ? 'RECIPE' : 'PANTRY ENTRY'
      if (!found) {
        issues.push({ code: 'LINE_TARGET_NOT_FOUND', severity: 'ERROR', rowId: row.id, field: 'lines', message: `LINE "${line.name}" NOT FOUND IN ${label} - MAP OR SKIP` })
      } else if (found === 'AMBIGUOUS') {
        issues.push({ code: 'LINE_TARGET_AMBIGUOUS', severity: 'ERROR', rowId: row.id, field: 'lines', message: `LINE "${line.name}" MATCHES MULTIPLE ${label}S - MAP OR SKIP` })
      }
      if (!findUom(line.uom, refs.uoms)) {
        issues.push({ code: 'LINE_UOM_NOT_FOUND', severity: 'ERROR', rowId: row.id, field: 'lines', message: `UNIT "${line.uom}" FOR "${line.name}" NOT FOUND` })
        continue
      }
      const kindError = lineKindError(line, refs)
      if (kindError) {
        issues.push({ code: 'LINE_UNIT_MISMATCH', severity: 'ERROR', rowId: row.id, field: 'lines', message: kindError })
      }
    }

    if (!issues.some((issue) => issue.severity === 'ERROR')) return { ...row, issues }
    return { ...row, issues, action: 'SKIP', include: false }
  })
}
