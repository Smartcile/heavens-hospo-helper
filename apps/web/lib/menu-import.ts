/**
 * Menu import — copy-paste LLM prompt + tolerant answer parser + editable draft.
 *
 * The app has no backend LLM: the operator copies the prompt into whatever
 * model they use, attaches the PDF menu, and pastes the answer back. This file
 * is pure and Prisma-free so the same parser runs in the browser preview and on
 * the server (which never trusts the client).
 *
 * Phase 1 imports name/price/description/sizes. Options are parsed and shown so
 * the operator can see what the menu carries, but they are NOT persisted yet
 * (the option model lands in a later phase). Dietaries are deliberately not
 * imported: allergens come from the product/recipe, never from an LLM answer.
 */

export interface MenuImportSize {
  label: string
  price: number
}

export interface MenuImportOptionChoice {
  name: string
  priceDelta: number
}

export interface MenuImportOption {
  name: string
  required: boolean
  min: number
  max: number
  choices: MenuImportOptionChoice[]
}

export interface MenuImportItem {
  name: string
  price: number | null
  description: string | null
  sizes: MenuImportSize[]
  options: MenuImportOption[]
}

export interface MenuImportGroup {
  name: string
  area: string | null
  items: MenuImportItem[]
}

export interface MenuImportData {
  name: string
  description: string | null
  groups: MenuImportGroup[]
}

export type MenuImportIssueKind =
  | 'MISSING_MENU_NAME'
  | 'MISSING_PRICE'
  | 'MISSING_DESCRIPTION'
  | 'MISSING_SIZE'
  | 'MISSING_GROUP'
  | 'DUPLICATE_NAME'
  | 'AMBIGUOUS_NAME'
  | 'NO_NAME'
  | 'DIETARY_IGNORED'

export interface MenuImportIssue {
  kind: MenuImportIssueKind
  message: string
  itemName?: string
  groupName?: string
}

export interface MenuImportParseResult {
  data: MenuImportData
  issues: MenuImportIssue[]
}

export interface MenuImportSummary {
  menuId: string
  created: number
  matched: number
  linesAdded: number
  linesUpdated: number
  skipped: number
  warnings: string[]
}

const MAX_ITEMS = 400

/**
 * One canonical name form for products, groups and dedupe: trimmed, internal
 * whitespace collapsed and uppercased. The route matches existing products on
 * this same key so `FISH  AND CHIPS` and `FISH AND CHIPS` are one product.
 */
export function normaliseMenuName(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

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
    `      {`,
    `        "name": "GROUP NAME",`,
    `        "area": "AREA or null",`,
    `        "items": [`,
    `          {`,
    `            "name": "DISH NAME",`,
    `            "price": 16.5,`,
    `            "description": "short description or null",`,
    `            "sizes": [{ "label": "400ML", "price": 16.5 }],`,
    `            "options": [`,
    `              {`,
    `                "name": "SIDE",`,
    `                "required": true,`,
    `                "min": 1,`,
    `                "max": 1,`,
    `                "choices": [`,
    `                  { "name": "FRIES", "priceDelta": 0 },`,
    `                  { "name": "SALAD", "priceDelta": 0 },`,
    `                  { "name": "FRIES AND SALAD", "priceDelta": 3 }`,
    `                ]`,
    `              }`,
    `            ]`,
    `          }`,
    `        ]`,
    `      }`,
    `    ]`,
    `  }`,
    `}`,
    ``,
    `Rules:`,
    `- Keep menu, group, item and choice names UPPERCASE.`,
    `- price is a decimal number in NZD, GST inclusive (e.g. $16.50 becomes 16.5). Never include a currency symbol.`,
    `- description is a short plain-text summary or null.`,
    `- area is the room/section the group belongs to, or null when the menu does not say. If items are returned flat, put group and area on each item instead.`,
    `- sizes are optional price points for one product (400ML / 1.4L, GLASS / BOTTLE). Omit sizes when the product has a single price.`,
    `- options are optional customer choices under one product. priceDelta is the upcharge for that choice (0 when included). required/min/max describe the selection rule.`,
    `- Do NOT include dietary or allergen claims — those come from the product and recipe, not the menu text.`,
    `- Only one row per product. Skip covers, legal text, footnotes, opening hours and contact details.`,
    `- Never invent items, groups, sizes, options or prices. If a price is missing, use null.`,
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

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[^0-9.,-]/g, '').replace(/,/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Tolerant price parse: `$16.50` → 16.5, `16,50` → 16.5, `+3` → 3. */
function toPrice(value: unknown): number | null {
  const n = toNumber(value)
  return n != null && n >= 0 ? n : null
}

export function parseImportPrice(value: unknown): number | null {
  return toPrice(value)
}

function toInteger(value: unknown): number {
  const n = toNumber(value)
  return n != null ? Math.max(0, Math.trunc(n)) : 0
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function parseSize(raw: unknown): { label: string; price: number | null } | null {
  if (raw && typeof raw === 'object') {
    const s = raw as Record<string, unknown>
    const label = normaliseMenuName(s.label ?? s.name ?? s.size)
    if (!label) return null
    return { label, price: toPrice(s.price ?? s.amount ?? s.cost) }
  }
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return null
    const m = text.match(/^(.*?)[\s:–—-]*([+-]?\s*\$?\s*[0-9]+(?:[.,][0-9]{1,2})?)\s*$/)
    if (m) {
      const label = normaliseMenuName(m[1])
      const price = toPrice(m[2])
      if (label && price != null) return { label, price }
    }
    return { label: normaliseMenuName(text), price: null }
  }
  return null
}

function parseSizes(raw: unknown): { sizes: MenuImportSize[]; missing: string[] } {
  const sizes: MenuImportSize[] = []
  const missing: string[] = []
  if (!Array.isArray(raw)) return { sizes, missing }
  for (const entry of raw) {
    const parsed = parseSize(entry)
    if (!parsed) continue
    if (sizes.some((s) => s.label === parsed.label)) continue
    if (parsed.price == null) {
      missing.push(parsed.label)
      sizes.push({ label: parsed.label, price: 0 })
    } else {
      sizes.push({ label: parsed.label, price: parsed.price })
    }
  }
  return { sizes, missing }
}

export function normaliseImportSizes(raw: unknown): MenuImportSize[] {
  return parseSizes(raw).sizes
}

function parseChoice(raw: unknown): MenuImportOptionChoice | null {
  if (raw && typeof raw === 'object') {
    const c = raw as Record<string, unknown>
    const name = normaliseMenuName(c.name ?? c.label ?? c.choice)
    if (!name) return null
    const delta = toNumber(c.priceDelta ?? c.delta ?? c.price ?? c.upcharge)
    return { name, priceDelta: delta != null && delta > 0 ? delta : 0 }
  }
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return null
    const m = text.match(/^(.*?)[\s:–—-]*([+-]?\s*\$?\s*[0-9]+(?:[.,][0-9]{1,2})?)\s*$/)
    if (m) {
      const name = normaliseMenuName(m[1])
      const delta = toNumber(m[2])
      if (name) return { name, priceDelta: delta != null && delta > 0 ? delta : 0 }
    }
    return { name: normaliseMenuName(text), priceDelta: 0 }
  }
  return null
}

function parseOptions(raw: unknown): MenuImportOption[] {
  if (!Array.isArray(raw)) return []
  const out: MenuImportOption[] = []
  for (const entry of raw) {
    let name = ''
    let required = false
    let min = 0
    let max = 1
    let rawChoices: unknown

    if (typeof entry === 'string') {
      name = normaliseMenuName(entry)
    } else if (entry && typeof entry === 'object') {
      const o = entry as Record<string, unknown>
      name = normaliseMenuName(o.name ?? o.label ?? o.group)
      const flag = typeof o.required === 'boolean' ? o.required : String(o.required ?? '').toLowerCase()
      required = flag === true || flag === 'true' || flag === 'yes'
      min = toInteger(o.min ?? o.minSelect ?? o.minimum)
      max = toInteger(o.max ?? o.maxSelect ?? o.maximum)
      rawChoices = o.choices ?? o.options ?? o.values
    }
    if (!name) continue
    if (out.some((o) => o.name === name)) continue

    const choices: MenuImportOptionChoice[] = []
    if (Array.isArray(rawChoices)) {
      for (const rawChoice of rawChoices) {
        const choice = parseChoice(rawChoice)
        if (choice && !choices.some((c) => c.name === choice.name)) choices.push(choice)
      }
    }

    const isRequired = required || min >= 1
    const minSelect = isRequired ? Math.max(1, min) : Math.max(0, min)
    const maxSelect = Math.max(minSelect, max > 0 ? max : 1)
    out.push({ name, required: isRequired, min: minSelect, max: maxSelect, choices })
  }
  return out
}

export function normaliseImportOptions(raw: unknown): MenuImportOption[] {
  return parseOptions(raw)
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

  const issues: MenuImportIssue[] = []
  const menuName = normaliseMenuName(menu.name)
  if (!menuName) issues.push({ kind: 'MISSING_MENU_NAME', message: 'MENU NAME IS MISSING' })

  const groups = new Map<string, MenuImportGroup>()
  const seen = new Set<string>()
  let total = 0
  let sawDietary = false

  function ensureGroup(name: string, area: string | null): MenuImportGroup {
    const key = normaliseMenuName(name) || 'MENU'
    let group = groups.get(key)
    if (!group) {
      group = { name: key, area, items: [] }
      groups.set(key, group)
    } else if (!group.area && area) {
      group.area = area
    }
    return group
  }

  function addItem(rawItem: unknown, group: MenuImportGroup): void {
    const itemObj = (rawItem && typeof rawItem === 'object' ? rawItem : {}) as Record<string, unknown>
    const name = normaliseMenuName(itemObj.name)
    if (!name) {
      issues.push({
        kind: 'NO_NAME',
        message: `SKIPPED A ROW WITH NO NAME IN "${group.name}"`,
        groupName: group.name,
      })
      return
    }
    if (seen.has(name)) {
      issues.push({
        kind: 'DUPLICATE_NAME',
        message: `DUPLICATE "${name}" — ONLY THE FIRST IS KEPT`,
        itemName: name,
        groupName: group.name,
      })
      return
    }
    seen.add(name)

    const price = toPrice(itemObj.price ?? itemObj.priceNzd ?? itemObj.cost)
    const { sizes, missing } = parseSizes(itemObj.sizes ?? itemObj.variants ?? itemObj.sizeOptions)
    const options = parseOptions(itemObj.options ?? itemObj.optionGroups ?? itemObj.modifiers)
    const description = toStringOrNull(itemObj.description)

    for (const label of missing) {
      issues.push({
        kind: 'MISSING_SIZE',
        message: `"${name}": SIZE "${label}" HAS NO PRICE`,
        itemName: name,
        groupName: group.name,
      })
    }
    if (price == null && sizes.length === 0) {
      issues.push({ kind: 'MISSING_PRICE', message: `"${name}" HAS NO VALID PRICE`, itemName: name, groupName: group.name })
    }
    if (!description) {
      issues.push({ kind: 'MISSING_DESCRIPTION', message: `"${name}" HAS NO DESCRIPTION`, itemName: name, groupName: group.name })
    }
    if (itemObj.dietary != null || itemObj.allergens != null || itemObj.dietaries != null) {
      sawDietary = true
    }

    group.items.push({ name, price, description, sizes, options })
    total++
  }

  const rawGroups = menu.groups
  if (Array.isArray(rawGroups) && rawGroups.length > 0) {
    for (const rawGroup of rawGroups) {
      const groupObj = (rawGroup && typeof rawGroup === 'object' ? rawGroup : {}) as Record<string, unknown>
      const groupName = normaliseMenuName(groupObj.name) || 'MENU'
      const area = normaliseMenuName(groupObj.area ?? groupObj.section) || null
      const group = ensureGroup(groupName, area)
      const rawItems = Array.isArray(groupObj.items) ? groupObj.items : []
      for (const rawItem of rawItems) addItem(rawItem, group)
    }
  } else if (Array.isArray(menu.items)) {
    for (const rawItem of menu.items) {
      const itemObj = (rawItem && typeof rawItem === 'object' ? rawItem : {}) as Record<string, unknown>
      const itemName = normaliseMenuName(itemObj.name)
      const groupName = normaliseMenuName(itemObj.group ?? itemObj.area)
      if (!groupName) {
        issues.push({
          kind: 'MISSING_GROUP',
          message: `"${itemName || 'ITEM'}" HAS NO GROUP OR AREA — FILED UNDER "MENU"`,
          itemName: itemName || undefined,
          groupName: 'MENU',
        })
      }
      const area = normaliseMenuName(itemObj.area) || null
      addItem(rawItem, ensureGroup(groupName || 'MENU', area))
    }
  } else {
    return { error: 'NO GROUPS OR ITEMS FOUND' }
  }

  if (sawDietary) {
    issues.push({
      kind: 'DIETARY_IGNORED',
      message: 'DIETARY NOT IMPORTED — ALLERGENS COME FROM THE PRODUCT',
    })
  }

  const dataGroups = [...groups.values()].filter((g) => g.items.length > 0)
  if (dataGroups.length === 0) return { error: 'NO ITEMS FOUND IN THE ANSWER' }
  if (total > MAX_ITEMS) return { error: `THAT IS TOO MANY ITEMS (${total}) — MAX ${MAX_ITEMS}` }

  return {
    data: {
      name: menuName || 'IMPORTED MENU',
      description: toStringOrNull(menu.description),
      groups: dataGroups,
    },
    issues,
  }
}

export function flattenMenuImport(data: MenuImportData): { group: string; item: MenuImportItem }[] {
  return data.groups.flatMap((g) => g.items.map((item) => ({ group: g.name, item })))
}

export type ImportMatch = 'MATCH' | 'NEW' | 'AMBIGUOUS'

/** Name → match status against the venue's existing products. */
export function matchImportItems(
  items: { name: string }[],
  existing: { id: string; name: string }[],
): Map<string, ImportMatch> {
  const counts = new Map<string, number>()
  for (const product of existing) {
    const key = normaliseMenuName(product.name)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const out = new Map<string, ImportMatch>()
  for (const item of items) {
    const count = counts.get(normaliseMenuName(item.name)) ?? 0
    out.set(item.name, count === 0 ? 'NEW' : count > 1 ? 'AMBIGUOUS' : 'MATCH')
  }
  return out
}

/** Structured issues for names that match several existing products. */
export function importMatchIssues(
  items: { name: string }[],
  existing: { id: string; name: string }[],
): MenuImportIssue[] {
  const matches = matchImportItems(items, existing)
  const issues: MenuImportIssue[] = []
  for (const item of items) {
    if (matches.get(item.name) === 'AMBIGUOUS') {
      issues.push({
        kind: 'AMBIGUOUS_NAME',
        message: `"${item.name}" MATCHES MORE THAN ONE PRODUCT — RESOLVE OR RENAME IT`,
        itemName: item.name,
      })
    }
  }
  return issues
}

// ---------------------------------------------------------------------------
// Editable preview draft — stable ids survive rename / move / reorder, so the
// include checkboxes are never keyed by a name the operator may have changed.
// ---------------------------------------------------------------------------

export interface MenuImportDraftItem {
  id: string
  name: string
  price: number | null
  description: string | null
  sizes: MenuImportSize[]
  options: MenuImportOption[]
}

export interface MenuImportDraftGroup {
  id: string
  name: string
  area: string | null
  items: MenuImportDraftItem[]
}

export interface MenuImportDraft {
  name: string
  description: string | null
  groups: MenuImportDraftGroup[]
}

export function createImportDraft(data: MenuImportData): MenuImportDraft {
  let groupIndex = 0
  return {
    name: data.name,
    description: data.description,
    groups: data.groups.map((group) => {
      const id = `g${groupIndex++}`
      let itemIndex = 0
      return {
        id,
        name: group.name,
        area: group.area,
        items: group.items.map((item) => ({
          id: `${id}_i${itemIndex++}`,
          name: item.name,
          price: item.price,
          description: item.description,
          sizes: item.sizes.map((s) => ({ ...s })),
          options: item.options.map((o) => ({ ...o, choices: o.choices.map((c) => ({ ...c })) })),
        })),
      }
    }),
  }
}

export function renameImportGroup(draft: MenuImportDraft, groupId: string, name: string): MenuImportDraft {
  return {
    ...draft,
    groups: draft.groups.map((g) => (g.id === groupId ? { ...g, name: String(name).toUpperCase() } : g)),
  }
}

export function setImportGroupArea(draft: MenuImportDraft, groupId: string, area: string): MenuImportDraft {
  const value = String(area).toUpperCase()
  return {
    ...draft,
    groups: draft.groups.map((g) => (g.id === groupId ? { ...g, area: value.trim() ? value : null } : g)),
  }
}

export function renameImportItem(draft: MenuImportDraft, itemId: string, name: string): MenuImportDraft {
  return {
    ...draft,
    groups: draft.groups.map((g) => ({
      ...g,
      items: g.items.map((item) => (item.id === itemId ? { ...item, name: String(name).toUpperCase() } : item)),
    })),
  }
}

export function moveImportGroup(draft: MenuImportDraft, groupId: string, direction: -1 | 1): MenuImportDraft {
  const index = draft.groups.findIndex((g) => g.id === groupId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= draft.groups.length) return draft
  const groups = [...draft.groups]
  ;[groups[index], groups[target]] = [groups[target], groups[index]]
  return { ...draft, groups }
}

export function reorderImportItem(draft: MenuImportDraft, itemId: string, direction: -1 | 1): MenuImportDraft {
  const group = draft.groups.find((g) => g.items.some((item) => item.id === itemId))
  if (!group) return draft
  const index = group.items.findIndex((item) => item.id === itemId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= group.items.length) return draft
  const items = [...group.items]
  ;[items[index], items[target]] = [items[target], items[index]]
  return {
    ...draft,
    groups: draft.groups.map((g) => (g.id === group.id ? { ...g, items } : g)),
  }
}

/** Move one item into another group (at the end unless an index is supplied). */
export function moveImportItem(
  draft: MenuImportDraft,
  itemId: string,
  targetGroupId: string,
  targetIndex?: number,
): MenuImportDraft {
  const source = draft.groups.find((g) => g.items.some((item) => item.id === itemId))
  const target = draft.groups.find((g) => g.id === targetGroupId)
  if (!source || !target) return draft
  const item = source.items.find((i) => i.id === itemId)
  if (!item) return draft

  const sourceItems = source.items.filter((i) => i.id !== itemId)
  const targetBase = source.id === target.id ? sourceItems : [...target.items]
  const insertAt = targetIndex == null
    ? targetBase.length
    : Math.max(0, Math.min(targetIndex, targetBase.length))
  targetBase.splice(insertAt, 0, item)

  return {
    ...draft,
    groups: draft.groups.map((g) => {
      if (g.id === source.id && g.id === target.id) return { ...g, items: targetBase }
      if (g.id === source.id) return { ...g, items: sourceItems }
      if (g.id === target.id) return { ...g, items: targetBase }
      return g
    }),
  }
}

/** Turn the edited draft into the payload the import route consumes. */
export function draftToImportData(
  draft: MenuImportDraft,
  include: (itemId: string) => boolean,
): MenuImportData {
  return {
    name: draft.name,
    description: draft.description,
    groups: draft.groups
      .map((group) => ({
        name: group.name,
        area: group.area,
        items: group.items
          .filter((item) => include(item.id))
          .map((item) => ({
            name: item.name,
            price: item.price,
            description: item.description,
            sizes: item.sizes,
            options: item.options,
          })),
      }))
      .filter((group) => group.items.length > 0),
  }
}

export function formatPriceDelta(delta: number): string {
  const n = Number.isFinite(delta) ? delta : 0
  if (n === 0) return '$0'
  return n > 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`
}

/** One-line description of a detected option group (display only in Phase 1). */
export function optionSummary(option: MenuImportOption): string {
  const rule = option.required ? 'REQUIRED' : `MIN ${option.min} · MAX ${option.max}`
  const choices = option.choices.map((c) => `${c.name} ${formatPriceDelta(c.priceDelta)}`).join(' / ')
  return `${option.name} · ${rule}${choices ? `: ${choices}` : ''}`
}
