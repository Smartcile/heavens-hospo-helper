/**
 * Menu import — copy-paste LLM prompt + tolerant answer parser.
 *
 * The app has no backend LLM: the operator copies the prompt into whatever
 * model they use, attaches the PDF menu, and pastes the answer back. This file
 * is pure and Prisma-free so the same parser runs in the browser preview and on
 * the server (which never trusts the client).
 */

import { ALLERGENS, type Allergen } from '@/lib/allergens'

export interface MenuImportItem {
  name: string
  price: number | null
  description: string | null
  dietary: Allergen[]
}

export interface MenuImportGroup {
  name: string
  items: MenuImportItem[]
}

export interface MenuImportData {
  name: string
  description: string | null
  groups: MenuImportGroup[]
}

export interface MenuImportParseResult {
  data: MenuImportData
  issues: string[]
}

const MAX_ITEMS = 400

export function buildMenuImportPrompt({
  menuNameHint,
  venueName,
}: {
  menuNameHint?: string
  venueName?: string
} = {}): string {
  const menu = menuNameHint?.trim() ? `"${menuNameHint.trim().toUpperCase()}"` : 'the menu'
  const venue = venueName?.trim() ? ` for ${venueName.trim()}` : ''
  return [
    `I'm importing ${menu}${venue} into a hospitality menu system.`,
    `Read the attached PDF menu and return the data as STRICT JSON in one fenced \`\`\`json block.`,
    `Do not add commentary outside the block.`,
    ``,
    `JSON shape:`,
    `{`,
    `  "menu": {`,
    `    "name": "MENU NAME",`,
    `    "description": "short description or null",`,
    `    "groups": [`,
    `      { "name": "GROUP NAME", "items": [`,
    `        { "name": "DISH NAME", "price": 16.5, "description": "short description or null", "dietary": ["GLUTEN", "MILK"] }`,
    `      ] }`,
    `    ]`,
    `  }`,
    `}`,
    ``,
    `Rules:`,
    `- Keep menu, group and item names UPPERCASE.`,
    `- price is a decimal number in NZD, GST inclusive (e.g. $16.50 becomes 16.5). Never include a currency symbol.`,
    `- description is a short plain-text summary or null.`,
    `- dietary may ONLY contain allergens from this list: ${ALLERGENS.join(', ')}.`,
    `  Do not use dietary claims like V, VE, GF or DF; omit any that do not map to an allergen.`,
    `- Skip covers, legal text, footnotes, opening hours and contact details.`,
    `- Never invent items, groups or prices. If a price is missing, use null.`,
  ].join('\n')
}

function extractJsonBlock(text: string): string | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return cleaned.slice(start, i + 1)
    }
  }
  return null
}

function toPrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[^0-9.,-]/g, '').replace(/,/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function toDietary(value: unknown): { tags: Allergen[]; unknown: string[] } {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,/]/) : []
  const tags: Allergen[] = []
  const unknown: string[] = []
  for (const entry of raw) {
    const token = String(entry).toUpperCase().trim()
    if (!token) continue
    if ((ALLERGENS as readonly string[]).includes(token)) {
      if (!tags.includes(token as Allergen)) tags.push(token as Allergen)
    } else {
      unknown.push(token)
    }
  }
  return { tags, unknown }
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Tolerant parse of the pasted answer. Accepts plain JSON, fenced JSON and
 * JSON surrounded by prose. Returns `{ error }` when nothing usable is found.
 */
export function parseMenuImportAnswer(raw: string): MenuImportParseResult | { error: string } {
  if (!raw || !raw.trim()) return { error: 'PASTE THE LLM ANSWER FIRST' }
  const json = extractJsonBlock(raw)
  if (!json) return { error: 'NO JSON FOUND IN THE ANSWER' }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { error: 'THE ANSWER IS NOT VALID JSON' }
  }

  const root = parsed as Record<string, unknown>
  const menu = (root.menu && typeof root.menu === 'object' ? root.menu : root) as Record<string, unknown>

  const issues: string[] = []
  const menuName = String(menu.name ?? '').toUpperCase().trim()
  if (!menuName) issues.push('MENU NAME IS MISSING')

  let rawGroups = menu.groups
  if (!Array.isArray(rawGroups) && Array.isArray(menu.items)) {
    rawGroups = [{ name: 'MENU', items: menu.items }]
  }
  if (!Array.isArray(rawGroups)) return { error: 'NO GROUPS OR ITEMS FOUND' }

  const groups: MenuImportGroup[] = []
  let total = 0

  for (const rawGroup of rawGroups) {
    const groupObj = (rawGroup && typeof rawGroup === 'object' ? rawGroup : {}) as Record<string, unknown>
    const groupName = String(groupObj.name ?? 'MENU').toUpperCase().trim() || 'MENU'
    const rawItems = Array.isArray(groupObj.items) ? groupObj.items : []
    const items: MenuImportItem[] = []
    const seen = new Set<string>()

    for (const rawItem of rawItems) {
      const itemObj = (rawItem && typeof rawItem === 'object' ? rawItem : {}) as Record<string, unknown>
      const name = String(itemObj.name ?? '').toUpperCase().trim()
      if (!name) {
        issues.push(`SKIPPED A ROW WITH NO NAME IN "${groupName}"`)
        continue
      }
      if (seen.has(name)) {
        issues.push(`DUPLICATE "${name}" IN "${groupName}" — ONLY THE FIRST IS KEPT`)
        continue
      }
      const price = toPrice(itemObj.price ?? itemObj.priceNzd ?? itemObj.cost)
      if (price == null) issues.push(`"${name}" HAS NO VALID PRICE`)
      const { tags, unknown } = toDietary(itemObj.dietary ?? itemObj.allergens ?? itemObj.dietaries)
      if (unknown.length > 0) {
        issues.push(`"${name}": IGNORED UNKNOWN DIETARY TAG${unknown.length === 1 ? '' : 'S'} ${unknown.join(', ')}`)
      }
      seen.add(name)
      items.push({ name, price, description: toStringOrNull(itemObj.description), dietary: tags })
      total++
    }

    if (items.length > 0) groups.push({ name: groupName, items })
  }

  if (groups.length === 0) return { error: 'NO ITEMS FOUND IN THE ANSWER' }
  if (total > MAX_ITEMS) return { error: `THAT IS TOO MANY ITEMS (${total}) — MAX ${MAX_ITEMS}` }

  return {
    data: { name: menuName || 'IMPORTED MENU', description: toStringOrNull(menu.description), groups },
    issues,
  }
}

export function flattenMenuImport(data: MenuImportData): { group: string; item: MenuImportItem }[] {
  return data.groups.flatMap((g) => g.items.map((item) => ({ group: g.name, item })))
}

export type ImportMatch = 'MATCH' | 'NEW' | 'AMBIGUOUS'

/** Name → match status against the venue's existing products. */
export function matchImportItems(
  items: MenuImportItem[],
  existing: { id: string; name: string }[],
): Map<string, ImportMatch> {
  const counts = new Map<string, number>()
  for (const product of existing) {
    const key = product.name.toUpperCase().trim()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const out = new Map<string, ImportMatch>()
  for (const item of items) {
    const count = counts.get(item.name) ?? 0
    out.set(item.name, count === 0 ? 'NEW' : count > 1 ? 'AMBIGUOUS' : 'MATCH')
  }
  return out
}
