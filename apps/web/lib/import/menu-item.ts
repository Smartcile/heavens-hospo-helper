import {
  extractJsonBlock,
  flattenMenuImport,
  normaliseMenuName,
  parseMenuImportAnswer,
  type MenuImportItem,
  type MenuImportOption,
  type MenuImportSize,
} from '@/lib/menu-import'
import { findSimilar, normaliseImportKey } from './similarity'
import type { ImportExisting, ImportIssue, ImportParseResult, ImportRow } from './types'

export interface MenuItemImportValues {
  name: string
  price: number | null
  description: string | null
  sizes: MenuImportSize[]
  options: MenuImportOption[]
}

export function buildMenuItemImportPrompt({ venueName }: { venueName?: string } = {}): string {
  const venue = venueName?.trim() ? ` for ${venueName.trim()}` : ''
  return [
    `I'm creating menu items${venue} in a hospitality system.`,
    `Read the attached document (PDF, photo or text) and return STRICT JSON in one fenced \`\`\`json block.`,
    `Do not add commentary outside the block.`,
    ``,
    `JSON shape:`,
    `{`,
    `  "products": [`,
    `    {`,
    `      "name": "DISH NAME",`,
    `      "price": 16.5,`,
    `      "description": "short description or null",`,
    `      "sizes": [{ "label": "400ML", "price": 16.5 }],`,
    `      "options": [`,
    `        { "name": "SIDE", "required": true, "min": 1, "max": 1, "choices": [`,
    `          { "name": "FRIES", "priceDelta": 0 },`,
    `          { "name": "SALAD", "priceDelta": 0 }`,
    `        ] }`,
    `      ]`,
    `    }`,
    `  ]`,
    `}`,
    ``,
    `Rules:`,
    `- Keep product, size and choice names UPPERCASE.`,
    `- price is a decimal NZD amount, GST inclusive; never include a currency symbol.`,
    `- description is a short plain-text summary or null.`,
    `- sizes are optional price points for one product (GLASS / BOTTLE, 400ML / 1.4L).`,
    `- options are optional customer choices under one product; priceDelta is the upcharge.`,
    `- Do NOT include dietary or allergen claims - those come from the product/recipe.`,
    `- One row per product. Never invent products, sizes, options or prices.`,
  ].join('\n')
}

function rowsFromItems(items: MenuImportItem[]): ImportRow<MenuItemImportValues>[] {
  const seen = new Map<string, string>()
  return items.map((item, index) => {
    const key = normaliseImportKey(item.name)
    const duplicateOf = seen.get(key)
    if (!duplicateOf) seen.set(key, `i${index}`)
    return {
      id: `i${index}`,
      values: {
        name: item.name,
        price: item.price,
        description: item.description,
        sizes: item.sizes,
        options: item.options,
      },
      include: !duplicateOf,
      action: duplicateOf ? 'SKIP' : 'CREATE',
      match: duplicateOf
        ? { status: 'DUPLICATE_IN_FILE', label: duplicateOf }
        : { status: 'NEW' },
      issues: duplicateOf
        ? [{ code: 'DUPLICATE_IN_FILE', severity: 'WARNING', message: `DUPLICATE "${item.name}" - ONLY THE FIRST IS KEPT` }]
        : [],
    }
  })
}

/** Parse either a flat `{ products: [...] }` answer or the existing menu shape. */
export function parseMenuItemImportAnswer(raw: string): ImportParseResult<MenuItemImportValues> | { error: string } {
  const json = extractJsonBlock(raw)
  if (!json) return { error: 'NO JSON FOUND IN THE ANSWER' }

  let root: Record<string, unknown>
  try {
    root = JSON.parse(json) as Record<string, unknown>
  } catch {
    return { error: 'THE ANSWER IS NOT VALID JSON' }
  }

  if (Array.isArray(root.products)) {
    const shape = {
      menu: {
        name: 'IMPORTED PRODUCTS',
        groups: [{ name: 'PRODUCTS', items: root.products }],
      },
    }
    const parsed = parseMenuImportAnswer(JSON.stringify(shape))
    if ('error' in parsed) return parsed
    return finish(rowsFromItems(flattenMenuImport(parsed.data).map((entry) => entry.item)), parsed.issues)
  }

  const parsed = parseMenuImportAnswer(raw)
  if ('error' in parsed) return parsed
  return finish(rowsFromItems(flattenMenuImport(parsed.data).map((entry) => entry.item)), parsed.issues)
}

function finish(
  rows: ImportRow<MenuItemImportValues>[],
  issues: { kind: string; message: string }[],
): ImportParseResult<MenuItemImportValues> | { error: string } {
  if (rows.length === 0) return { error: 'NO PRODUCTS FOUND IN THE ANSWER' }
  return {
    rows,
    issues: issues.map((issue): ImportIssue => ({ code: issue.kind, severity: 'WARNING', message: issue.message })),
  }
}

/** Apply exact / in-file / similar matching against existing products. */
export function matchMenuItemRows(
  rows: ImportRow<MenuItemImportValues>[],
  existing: ImportExisting[],
): ImportRow<MenuItemImportValues>[] {
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
        match: { status: 'AMBIGUOUS', label: `${exact.length} EXISTING PRODUCTS` },
        issues: [...row.issues, { code: 'AMBIGUOUS_NAME', severity: 'ERROR', message: `"${row.values.name}" MATCHES ${exact.length} PRODUCTS - RENAME OR SKIP` }],
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

export function normaliseMenuItemName(value: unknown): string {
  return normaliseMenuName(value)
}
