// Product-reference tables (GuideType.PRODUCT_REFERENCE).
//
// A reference guide renders a table instead of steps: `Guide.tableColumns` holds
// the admin-defined column list, each `GuideTableRow` holds the manual cell data
// and an optional linked MenuItem. Columns tied to a menu field are DERIVED from
// that product at read time and never stored, so the price/description/image can
// never drift from the menu item (the image in particular is shared).
//
// Pure and Prisma-free: imported by both the admin editor and the worker reader.

export type ReferenceColumnType =
  | 'MENU_ITEM'
  | 'MENU_FIELD'
  | 'METHOD'
  | 'SERVE'
  | 'TEXT'
  | 'LONG_TEXT'
  | 'NUMBER'
  | 'IMAGE'
  | 'SELECT'

export type MenuField =
  | 'NAME'
  | 'PRICE'
  | 'DESCRIPTION'
  | 'IMAGE'
  | 'DIETARY'
  | 'TASTING_NOTES'
  | 'VINTAGE'
  | 'HOW_TO_SERVE'
  | 'EQUIPMENT'

export const REFERENCE_COLUMN_TYPES: ReferenceColumnType[] = [
  'MENU_ITEM',
  'MENU_FIELD',
  'METHOD',
  'SERVE',
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'IMAGE',
  'SELECT',
]

export const MENU_FIELDS: MenuField[] = ['NAME', 'PRICE', 'DESCRIPTION', 'IMAGE', 'DIETARY', 'TASTING_NOTES', 'VINTAGE', 'HOW_TO_SERVE', 'EQUIPMENT']

export const REFERENCE_COLUMN_TYPE_LABELS: Record<ReferenceColumnType, string> = {
  MENU_ITEM: 'LINKED PRODUCT',
  MENU_FIELD: 'FROM PRODUCT',
  METHOD: 'SERVE METHOD',
  SERVE: 'SERVE SIZE',
  TEXT: 'TEXT',
  LONG_TEXT: 'LONG TEXT',
  NUMBER: 'NUMBER',
  IMAGE: 'IMAGE',
  SELECT: 'CHOICE',
}

/** True when the column derives from the linked product (never stored). */
export function isDerivedColumn(col: ReferenceColumn): boolean {
  return col.type === 'MENU_FIELD' || col.type === 'METHOD' || col.type === 'SERVE'
}

export const MENU_FIELD_LABELS: Record<MenuField, string> = {
  NAME: 'NAME',
  PRICE: 'PRICE',
  DESCRIPTION: 'DESCRIPTION',
  IMAGE: 'IMAGE',
  DIETARY: 'ALLERGENS / DIETARY',
  TASTING_NOTES: 'TASTING NOTES',
  VINTAGE: 'VINTAGE / YEAR',
  HOW_TO_SERVE: 'HOW TO SERVE',
  EQUIPMENT: 'GLASSWARE / EQUIPMENT',
}

export type ColumnWidth = 'S' | 'M' | 'L'

export interface ReferenceColumn {
  /** Stable id used as the key in every row's `cells`. */
  key: string
  label: string
  type: ReferenceColumnType
  /** Required when type is MENU_FIELD. */
  menuField?: MenuField
  /** Choices for a SELECT column. */
  options?: string[]
  width?: ColumnWidth
}

/** The linked product, reduced to what a reference table can display. */
export interface ReferenceMenuItem {
  id: string
  name: string
  price: number
  description: string | null
  imageUrl: string | null
  dietaryInfo: string | null
  /** Product detail fields (see MenuItem in schema). */
  tastingNotes?: string | null
  vintage?: string | null
  howToServe?: string | null
  /** Equipment links, already summarised ("1x WINE GLASS, 1x DECANTER"). */
  equipment?: string | null
  /** Derived from the product's serves (see lib/menu-serves.ts). */
  serveMethod?: string | null
  serveSummary?: string | null
}

/** Summary of a product's equipment links, in link order. */
export function formatEquipment(links: { name: string; qty?: number | null }[]): string | null {
  const parts = links
    .filter((l) => l.name)
    .map((l) => `${l.qty && l.qty > 1 ? `${l.qty}x ` : ''}${l.name}`)
  return parts.length ? parts.join(', ') : null
}

export interface ReferenceRowLike {
  menuItemId?: string | null
  menuItem?: ReferenceMenuItem | null
  cells?: Record<string, unknown> | null
}

export function isReferenceColumnType(value: unknown): value is ReferenceColumnType {
  return typeof value === 'string' && (REFERENCE_COLUMN_TYPES as string[]).includes(value)
}

export function isMenuField(value: unknown): value is MenuField {
  return typeof value === 'string' && (MENU_FIELDS as string[]).includes(value)
}

export function columnTypeLabel(value: string | null | undefined): string | null {
  return isReferenceColumnType(value) ? REFERENCE_COLUMN_TYPE_LABELS[value] : null
}

export function menuFieldLabel(value: string | null | undefined): string | null {
  return isMenuField(value) ? MENU_FIELD_LABELS[value] : null
}

/** The columns a new product-reference guide starts with. */
export const PRODUCT_REFERENCE_DEFAULT_COLUMNS: ReferenceColumn[] = [
  { key: 'item', label: 'ITEM', type: 'MENU_ITEM', width: 'L' },
  { key: 'price', label: 'PRICE', type: 'MENU_FIELD', menuField: 'PRICE', width: 'S' },
  { key: 'description', label: 'DESCRIPTION', type: 'MENU_FIELD', menuField: 'DESCRIPTION', width: 'L' },
  { key: 'equipment', label: 'GLASSWARE / EQUIPMENT', type: 'MENU_FIELD', menuField: 'EQUIPMENT', width: 'M' },
  { key: 'serve_measure', label: 'SERVE MEASURE', type: 'SERVE', width: 'S' },
  { key: 'how_to_serve', label: 'HOW TO SERVE', type: 'MENU_FIELD', menuField: 'HOW_TO_SERVE', width: 'L' },
  { key: 'tasting', label: 'TASTING PROFILE', type: 'MENU_FIELD', menuField: 'TASTING_NOTES', width: 'L' },
  { key: 'vintage', label: 'VINTAGE / YEAR', type: 'MENU_FIELD', menuField: 'VINTAGE', width: 'S' },
  { key: 'image', label: 'IMAGE', type: 'MENU_FIELD', menuField: 'IMAGE', width: 'M' },
]

const KEY_RE = /^[a-z0-9_]{1,48}$/

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

function uniqueKey(base: string, taken: Set<string>): string {
  const root = KEY_RE.test(base) ? base : 'column'
  let key = root
  let n = 2
  while (taken.has(key)) key = `${root}_${n++}`
  taken.add(key)
  return key
}

/**
 * Validate + normalise an admin-supplied column list: unknown types dropped,
 * MENU_FIELD without a valid menu field dropped, keys made unique, options
 * kept only for SELECT. Order is preserved.
 */
export function sanitiseColumns(raw: unknown): ReferenceColumn[] {
  if (!Array.isArray(raw)) return []
  const taken = new Set<string>()
  const out: ReferenceColumn[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const c = item as Record<string, unknown>
    if (!isReferenceColumnType(c.type)) continue
    const label = typeof c.label === 'string' && c.label.trim() ? c.label.trim().toUpperCase() : null
    if (!label) continue

    const type = c.type
    let menuField: MenuField | undefined
    if (type === 'MENU_FIELD') {
      if (!isMenuField(c.menuField)) continue
      menuField = c.menuField
    }

    const rawKey = typeof c.key === 'string' && c.key.trim() ? c.key.trim().toLowerCase() : slugify(label)
    const key = uniqueKey(rawKey, taken)

    const col: ReferenceColumn = { key, label, type }
    if (menuField) col.menuField = menuField
    if (type === 'SELECT') {
      const options = Array.isArray(c.options)
        ? c.options.map((o) => (typeof o === 'string' ? o.trim() : '')).filter(Boolean)
        : []
      col.options = options
    }
    if (c.width === 'S' || c.width === 'M' || c.width === 'L') col.width = c.width
    out.push(col)
    if (out.length >= 24) break
  }
  return out
}

/**
 * The manual cell data for one row, restricted to the guide's current columns.
 * Only manual columns are stored — derived (MENU_FIELD) values are not.
 */
export function sanitiseCells(raw: unknown, columns: ReferenceColumn[]): Record<string, string> {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const out: Record<string, string> = {}
  for (const col of columns) {
    if (isDerivedColumn(col)) continue
    const value = source[col.key]
    if (value == null) continue
    if (Array.isArray(value)) {
      const joined = value.filter((v) => typeof v === 'string' && v.trim()).join(', ')
      if (joined) out[col.key] = joined
    } else if (typeof value === 'string' || typeof value === 'number') {
      const s = String(value).trim()
      if (s) out[col.key] = s
    }
  }
  return out
}

export function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return ''
  return `$${value.toFixed(2)}`
}

/** Resolve a derived menu field, or null when there is no linked product. */
export function menuFieldValue(menuItem: ReferenceMenuItem | null | undefined, field: MenuField): string | null {
  if (!menuItem) return null
  switch (field) {
    case 'NAME':
      return menuItem.name || null
    case 'PRICE':
      return formatMoney(menuItem.price) || null
    case 'DESCRIPTION':
      return menuItem.description || null
    case 'DIETARY':
      return menuItem.dietaryInfo || null
    case 'IMAGE':
      return menuItem.imageUrl || null
    case 'TASTING_NOTES':
      return menuItem.tastingNotes || null
    case 'VINTAGE':
      return menuItem.vintage || null
    case 'HOW_TO_SERVE':
      return menuItem.howToServe || null
    case 'EQUIPMENT':
      return menuItem.equipment || null
  }
}

/**
 * The text to show for a cell. Derived columns read from the linked product
 * (blank when unlinked); manual columns read the row's stored cell.
 */
export function displayCellText(row: ReferenceRowLike, col: ReferenceColumn): string | null {
  if (col.type === 'MENU_ITEM') {
    const linked = row.menuItem?.name ?? null
    if (linked) return linked
    const manual = row.cells?.[col.key]
    return typeof manual === 'string' && manual.trim() ? manual.trim() : null
  }
  if (col.type === 'MENU_FIELD') {
    return col.menuField ? menuFieldValue(row.menuItem, col.menuField) : null
  }
  if (col.type === 'METHOD') {
    return row.menuItem?.serveMethod ?? null
  }
  if (col.type === 'SERVE') {
    return row.menuItem?.serveSummary ?? null
  }
  const value = row.cells?.[col.key]
  if (value == null) return null
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** The image URL for a cell: derived from the product, or a manual upload. */
export function displayCellImage(row: ReferenceRowLike, col: ReferenceColumn): string | null {
  if (col.type === 'MENU_FIELD' && col.menuField === 'IMAGE') {
    return row.menuItem?.imageUrl ?? null
  }
  if (col.type === 'IMAGE') {
    const value = row.cells?.[col.key]
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }
  return null
}

/** True when the column carries admin-entered data on the row (not derived). */
export function columnIsEditable(col: ReferenceColumn): boolean {
  return !isDerivedColumn(col)
}

/** A draft row as the editor holds it (`id` null = not yet saved). */
export interface ReferenceRowDraftLike {
  id: string | null
  menuItemId: string | null
  cells: Record<string, string>
}

/**
 * Additive merge of a menu's products into a reference table's rows: append a
 * row for every menu item not already present. Never removes or reorders, so a
 * manually added off-menu row and any hand-typed cells survive a re-sync.
 * Returns the same array instance when there is nothing to add, so React state
 * stays referentially stable.
 */
export function mergeMenuRows(
  rows: ReferenceRowDraftLike[],
  menuItemIds: readonly string[],
): ReferenceRowDraftLike[] {
  const present = new Set(rows.map((r) => r.menuItemId).filter((id): id is string => !!id))
  const additions: ReferenceRowDraftLike[] = []
  for (const id of menuItemIds) {
    if (!id || present.has(id)) continue
    present.add(id)
    additions.push({ id: null, menuItemId: id, cells: {} })
  }
  return additions.length ? [...rows, ...additions] : rows
}
