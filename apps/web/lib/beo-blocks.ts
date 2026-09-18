// The BEO block library — the single source of truth for the composable parts
// of a banquet event order.
//
// Pure and Prisma-free: the server stores `BeoBlock.type` verbatim and the
// builder renders from this file, so adding a block type is a new entry here,
// not a migration. `config` holds the block's payload; a field may instead
// `eventField`-bind to a column on the Event row (contact, menu, setup,
// deposit, style) so those live in one place rather than being duplicated.

export type BeoFieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'menu'
  | 'setup'
  | 'items'
  | 'rows'

export interface BeoRowColumn {
  key: string
  label: string
  kind?: 'text' | 'number'
}

export interface BeoBlockField {
  key: string
  label: string
  kind: BeoFieldKind
  /** When set, the field reads/writes this Event column instead of `config`. */
  eventField?: string
  options?: { value: string; label: string }[]
  /** Column spec for `kind: 'rows'`. */
  columns?: BeoRowColumn[]
  placeholder?: string
}

export interface BeoBlockDef {
  type: string
  label: string
  group: string
  description: string
  defaultConfig: Record<string, unknown>
  fields: BeoBlockField[]
  /** Read-only blocks render their data but are never edited. */
  readOnly?: boolean
  /**
   * Playbook references attached to this area. Populated at runtime from
   * `BeoBlockLink` rows (built-in and custom areas alike) — never stored on the
   * def itself, so a built-in area can carry references without a def row.
   */
  guideIds?: string[]
  taskIds?: string[]
  checklistIds?: string[]
}

/** The minimum shape the pure helpers need — matches a `BeoBlock` row. */
export interface BeoBlockLike {
  id: string
  type: string
  title: string | null
  config: Record<string, unknown>
  sortOrder: number
}

/**
 * A resolved library: the built-in blocks plus any venue-authored `BeoBlockDef`
 * rows. Every helper that resolves a type takes one of these (defaulting to the
 * built-ins), so a custom block flows through the builder, the PDF and the share
 * view exactly like a built-in one.
 */
export type BlockLibrary = BeoBlockDef[]

/** The group new custom blocks land in when the author names none. */
export const CUSTOM_BLOCK_GROUP = 'CUSTOM'

/**
 * Field kinds a venue-authored block may use. Deliberately narrower than the
 * full `BeoFieldKind`: `menu` / `setup` / `items` depend on venue reference data
 * and event pricing, so custom blocks stay plain config (text/number/select/rows).
 */
export const CUSTOM_FIELD_KINDS: BeoFieldKind[] = ['text', 'textarea', 'number', 'select', 'rows']

export const BEO_BLOCK_GROUPS = ['DETAILS', 'FOOD & DRINK', 'ROOM', 'LOGISTICS', 'ADMIN'] as const

export const BEO_BLOCKS: BeoBlockDef[] = [
  {
    type: 'CUSTOMER_DETAILS',
    label: 'CUSTOMER DETAILS',
    group: 'DETAILS',
    description: 'CONTACT NAME, EMAIL, PHONE AND BILLING NOTES.',
    defaultConfig: { billingNotes: '' },
    fields: [
      { key: 'contactName', label: 'CONTACT NAME', kind: 'text', eventField: 'contactName' },
      { key: 'contactEmail', label: 'EMAIL', kind: 'text', eventField: 'contactEmail' },
      { key: 'contactPhone', label: 'PHONE', kind: 'text', eventField: 'contactPhone' },
      { key: 'billingNotes', label: 'BILLING NOTES', kind: 'textarea' },
    ],
  },
  {
    type: 'DINING_STYLE',
    label: 'DINING STYLE',
    group: 'FOOD & DRINK',
    description: 'PLATED, BUFFET, COCKTAIL — HOW THE ROOM IS SERVED.',
    defaultConfig: { serviceNotes: '' },
    fields: [
      {
        key: 'diningStyle',
        label: 'STYLE',
        kind: 'text',
        eventField: 'diningStyle',
        placeholder: 'PLATED',
      },
      { key: 'serviceNotes', label: 'SERVICE NOTES', kind: 'textarea' },
    ],
  },
  {
    type: 'MENU_SELECTION',
    label: 'MENU SELECTION',
    group: 'FOOD & DRINK',
    description: 'PICK A MENU AND THE DISHES, WITH QUANTITIES.',
    defaultConfig: { items: [], notes: '' },
    fields: [
      { key: 'menuId', label: 'MENU', kind: 'menu', eventField: 'menuId' },
      { key: 'items', label: 'DISHES', kind: 'items' },
      { key: 'notes', label: 'NOTES', kind: 'textarea' },
    ],
  },
  {
    type: 'DRINKS_SELECTION',
    label: 'DRINKS SELECTION',
    group: 'FOOD & DRINK',
    description: 'BEVERAGE PACKAGE AND DRINK LINES.',
    defaultConfig: { packageName: '', items: [], notes: '' },
    fields: [
      { key: 'packageName', label: 'PACKAGE', kind: 'text', placeholder: '3 HOUR BEVERAGE PACKAGE' },
      { key: 'items', label: 'DRINKS', kind: 'items' },
      { key: 'notes', label: 'NOTES', kind: 'textarea' },
    ],
  },
  {
    type: 'DIETARY',
    label: 'DIETARY REQUIREMENTS',
    group: 'FOOD & DRINK',
    description: 'ALLERGIES AND DIETARY NEEDS BY GUEST.',
    defaultConfig: { rows: [] },
    fields: [
      {
        key: 'rows',
        label: 'REQUIREMENTS',
        kind: 'rows',
        columns: [
          { key: 'name', label: 'GUEST' },
          { key: 'requirement', label: 'REQUIREMENT' },
          { key: 'count', label: 'COUNT', kind: 'number' },
        ],
      },
    ],
  },
  {
    type: 'ROOM_SETUP',
    label: 'ROOM SETUP',
    group: 'ROOM',
    description: 'THE FLOOR PLAN LAYOUT AND SETUP NOTES.',
    defaultConfig: { layoutNotes: '' },
    fields: [
      { key: 'setupId', label: 'LAYOUT', kind: 'setup', eventField: 'setupId' },
      { key: 'layoutNotes', label: 'SETUP NOTES', kind: 'textarea' },
    ],
  },
  {
    type: 'TIMELINE',
    label: 'RUN SHEET',
    group: 'LOGISTICS',
    description: 'THE EVENT TIMELINE — ARRIVALS, SPEECHES, SERVICE.',
    defaultConfig: { rows: [] },
    fields: [
      {
        key: 'rows',
        label: 'TIMELINE',
        kind: 'rows',
        columns: [
          { key: 'time', label: 'TIME' },
          { key: 'label', label: 'WHAT' },
          { key: 'note', label: 'NOTE' },
        ],
      },
    ],
  },
  {
    type: 'STAFFING',
    label: 'STAFFING',
    group: 'LOGISTICS',
    description: 'ROLES AND HEADCOUNT NEEDED FOR THE EVENT.',
    defaultConfig: { rows: [] },
    fields: [
      {
        key: 'rows',
        label: 'ROLES',
        kind: 'rows',
        columns: [
          { key: 'role', label: 'ROLE' },
          { key: 'count', label: 'COUNT', kind: 'number' },
          { key: 'note', label: 'NOTE' },
        ],
      },
    ],
  },
  {
    type: 'VENDORS',
    label: 'VENDORS',
    group: 'LOGISTICS',
    description: 'EXTERNAL SUPPLIERS, ENTERTAINMENT AND CONTACTS.',
    defaultConfig: { rows: [] },
    fields: [
      {
        key: 'rows',
        label: 'VENDORS',
        kind: 'rows',
        columns: [
          { key: 'name', label: 'NAME' },
          { key: 'contact', label: 'CONTACT' },
          { key: 'note', label: 'NOTE' },
        ],
      },
    ],
  },
  {
    type: 'TRANSPORT',
    label: 'TRANSPORT',
    group: 'LOGISTICS',
    description: 'ARRIVALS, TRANSFERS AND PARKING.',
    defaultConfig: { rows: [] },
    fields: [
      {
        key: 'rows',
        label: 'TRANSPORT',
        kind: 'rows',
        columns: [
          { key: 'time', label: 'TIME' },
          { key: 'detail', label: 'DETAIL' },
        ],
      },
    ],
  },
  {
    type: 'PAYMENT',
    label: 'PAYMENT',
    group: 'ADMIN',
    description: 'DEPOSIT, PAYMENT METHOD AND DUE DATES.',
    defaultConfig: { method: '', dueDate: '', notes: '' },
    fields: [
      {
        key: 'depositAmount',
        label: 'DEPOSIT',
        kind: 'number',
        eventField: 'depositAmount',
      },
      {
        key: 'method',
        label: 'METHOD',
        kind: 'select',
        options: [
          { value: '', label: 'NOT SET' },
          { value: 'INVOICE', label: 'INVOICE' },
          { value: 'CARD', label: 'CARD' },
          { value: 'CASH', label: 'CASH' },
          { value: 'BANK TRANSFER', label: 'BANK TRANSFER' },
        ],
      },
      { key: 'dueDate', label: 'DUE DATE', kind: 'text', placeholder: 'YYYY-MM-DD' },
      { key: 'notes', label: 'NOTES', kind: 'textarea' },
    ],
  },
  {
    type: 'NOTES',
    label: 'NOTES',
    group: 'ADMIN',
    description: 'FREE NOTES FOR THE EVENT TEAM.',
    defaultConfig: { text: '' },
    fields: [{ key: 'text', label: 'NOTES', kind: 'textarea' }],
  },
  {
    type: 'HISTORY',
    label: 'HISTORY',
    group: 'ADMIN',
    description: 'THE EVENT ACTIVITY LOG — AUTOMATIC, READ-ONLY.',
    defaultConfig: {},
    readOnly: true,
    fields: [],
  },
  {
    type: 'CUSTOM_TEXT',
    label: 'CUSTOM TEXT',
    group: 'ADMIN',
    description: 'A HEADING AND BODY FOR ANYTHING ELSE.',
    defaultConfig: { heading: '', body: '' },
    fields: [
      { key: 'heading', label: 'HEADING', kind: 'text' },
      { key: 'body', label: 'BODY', kind: 'textarea' },
    ],
  },
]

/** Every built-in type key — used to stop a custom def shadowing a built-in. */
export const BUILT_IN_BLOCK_TYPES: string[] = BEO_BLOCKS.map((b) => b.type)

/** Every block type key, for validation. */
export const BEO_BLOCK_TYPES: string[] = BUILT_IN_BLOCK_TYPES

/** The library definition for a type, or undefined when the key is unknown. */
export function blockDef(type: string, library: BlockLibrary = BEO_BLOCKS): BeoBlockDef | undefined {
  return library.find((b) => b.type === type)
}

/** A human label for a type — falls back to the raw key for an unknown block. */
export function blockLabel(type: string, library: BlockLibrary = BEO_BLOCKS): string {
  return blockDef(type, library)?.label ?? type
}

/** A fresh config for a type (deep-cloned so callers can't share arrays). */
export function defaultConfigFor(type: string, library: BlockLibrary = BEO_BLOCKS): Record<string, unknown> {
  const def = blockDef(type, library)
  if (!def) return {}
  return JSON.parse(JSON.stringify(def.defaultConfig)) as Record<string, unknown>
}

/**
 * The built-ins plus venue-authored defs, in built-in-first order. A custom def
 * whose key collides with a built-in is dropped — the built-in always wins.
 */
export function mergeLibrary(customDefs: BeoBlockDef[] | null | undefined): BlockLibrary {
  const builtIn = new Set(BUILT_IN_BLOCK_TYPES)
  const custom = (customDefs ?? []).filter((d) => d && d.type && !builtIn.has(d.type))
  return [...BEO_BLOCKS, ...custom]
}

/** The distinct groups present in a library, in first-seen order. */
export function libraryGroups(library: BlockLibrary = BEO_BLOCKS): string[] {
  const seen: string[] = []
  for (const b of library) if (!seen.includes(b.group)) seen.push(b.group)
  return seen
}

/** True when a type is one of the hard-coded built-ins (never editable). */
export function isBuiltInType(type: string): boolean {
  return BUILT_IN_BLOCK_TYPES.includes(type)
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {}
}

/**
 * Validate + normalise a `fields` blob from a custom-def row into the spec the
 * editor renders. Unknown kinds, missing keys/labels and row fields without
 * columns are dropped rather than trusted.
 */
export function sanitiseFields(raw: unknown): BeoBlockField[] {
  if (!Array.isArray(raw)) return []
  const out: BeoBlockField[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const f = item as Record<string, unknown>
    const key = String(f.key ?? '').trim()
    const label = String(f.label ?? '').trim()
    const kind = String(f.kind ?? '') as BeoFieldKind
    if (!key || !label || seen.has(key) || !CUSTOM_FIELD_KINDS.includes(kind)) continue
    seen.add(key)
    const field: BeoBlockField = { key, label, kind }
    if (typeof f.placeholder === 'string' && f.placeholder) field.placeholder = f.placeholder
    if (kind === 'select') {
      field.options = Array.isArray(f.options)
        ? (f.options as { value?: unknown; label?: unknown }[])
            .filter((o) => o && String(o.value ?? '') !== '' && String(o.label ?? '') !== '')
            .map((o) => ({ value: String(o.value), label: String(o.label) }))
        : []
    }
    if (kind === 'rows') {
      const cols = Array.isArray(f.columns) ? (f.columns as Record<string, unknown>[]) : []
      field.columns = cols
        .map((c) => ({
          key: String(c.key ?? '').trim(),
          label: String(c.label ?? '').trim(),
          kind: c.kind === 'number' ? ('number' as const) : ('text' as const),
        }))
        .filter((c) => c.key && c.label)
      if (field.columns.length === 0) continue
    }
    out.push(field)
  }
  return out
}

/**
 * Convert a `BeoBlockDef` row into a library definition. `eventField` is never
 * produced — custom blocks are config-only by construction.
 */
export function defRowToBlockDef(row: {
  key: string
  label: string
  group?: string | null
  description?: string | null
  defaultConfig?: unknown
  fields?: unknown
}): BeoBlockDef {
  return {
    type: row.key,
    label: row.label,
    group: row.group?.trim() || CUSTOM_BLOCK_GROUP,
    description: row.description?.trim() || '',
    defaultConfig: asObject(row.defaultConfig),
    fields: sanitiseFields(row.fields),
  }
}

/**
 * Backfill a stored config against the current definition so a block saved
 * before a field existed still renders. Never drops unknown keys — a template
 * from a newer build is preserved rather than silently trimmed.
 */
export function normaliseConfig(
  type: string,
  config: unknown,
  library: BlockLibrary = BEO_BLOCKS,
): Record<string, unknown> {
  const def = blockDef(type, library)
  const base = config && typeof config === 'object' ? { ...(config as Record<string, unknown>) } : {}
  if (!def) return base
  for (const field of def.fields) {
    if (field.eventField) continue // bound fields live on the Event row
    if (!(field.key in base)) {
      const dflt = def.defaultConfig[field.key]
      base[field.key] = dflt === undefined ? '' : JSON.parse(JSON.stringify(dflt))
    }
  }
  return base
}

/**
 * Remove any bound (Event-column) keys from a config before it is stored, so a
 * malformed client can never shadow the Event row. Keeps unknown keys.
 */
export function stripBoundFields(
  type: string,
  config: unknown,
  library: BlockLibrary = BEO_BLOCKS,
): Record<string, unknown> {
  const def = blockDef(type, library)
  const base = config && typeof config === 'object' ? { ...(config as Record<string, unknown>) } : {}
  if (!def) return base
  for (const field of def.fields) {
    if (field.eventField) delete base[field.key]
  }
  return base
}

/** The block types in `blocks` that are not in the library. Empty = all valid. */
export function invalidBlockTypes(
  blocks: { type?: unknown }[],
  library: BlockLibrary = BEO_BLOCKS,
): string[] {
  const valid = new Set(library.map((b) => b.type))
  return blocks
    .map((b) => String(b?.type ?? ''))
    .filter((t) => t !== '' && !valid.has(t))
}

/** Build a new block row (client-side; the id is minted by the caller or DB). */
export function makeBlock(
  type: string,
  sortOrder: number,
  overrides: Partial<BeoBlockLike> = {},
  library: BlockLibrary = BEO_BLOCKS,
): BeoBlockLike {
  return {
    id: overrides.id ?? '',
    type,
    title: overrides.title ?? null,
    config: overrides.config ?? defaultConfigFor(type, library),
    sortOrder,
  }
}

/** Reorder a block within the list. Returns a new array with `sortOrder` reset. */
export function moveBlock<T extends { sortOrder: number }>(
  blocks: T[],
  index: number,
  direction: -1 | 1,
): T[] {
  const target = index + direction
  if (index < 0 || index >= blocks.length || target < 0 || target >= blocks.length) return blocks
  const next = [...blocks]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next.map((b, i) => ({ ...b, sortOrder: i }))
}

/**
 * A one-line summary for a collapsed block card. Counts lists/rows, otherwise
 * shows the first non-empty scalar value.
 */
export function summariseBlock(
  block: { type: string; config: Record<string, unknown> },
  library: BlockLibrary = BEO_BLOCKS,
): string {
  const cfg = block.config ?? {}
  if (Array.isArray(cfg.items)) {
    const n = cfg.items.length
    return n === 0 ? 'NO ITEMS' : `${n} ITEM${n === 1 ? '' : 'S'}`
  }
  if (Array.isArray(cfg.rows)) {
    const n = cfg.rows.length
    return n === 0 ? 'NO ROWS' : `${n} ROW${n === 1 ? '' : 'S'}`
  }
  for (const value of Object.values(cfg)) {
    if (typeof value === 'string' && value.trim()) return value.trim().toUpperCase().slice(0, 60)
  }
  const def = blockDef(block.type, library)
  return def ? def.description : ''
}
