// Delete protection for inventory items that are still referenced elsewhere.
//
// Pure helpers only (no Prisma). The DB half lives in inventory-usage.server.ts
// so a client bundle can import these types/labels safely.

export const INVENTORY_IN_USE_ERROR = 'IN USE'

export type InventoryBlockerKind =
  | 'FLOOR_PLAN_ELEMENT'
  | 'FLOOR_PLAN_SETUP'
  | 'STOCKTAKE'
  | 'RECIPE'
  | 'TASK'
  | 'PRODUCT_LINK'
  | 'SERVE'
  | 'MENU_LINE'
  | 'SUPPLIER_CODE'
  | 'PURCHASE_ORDER'
  | 'INVOICE'
  | 'DELIVERY'
  | 'FURNITURE_BOM'
  | 'SUPPLIER_ALIAS'
  | 'PRICE_MOVEMENT'

export interface InventoryBlocker {
  kind: InventoryBlockerKind
  count: number
  /** Plain-English, e.g. "Used in 3 recipes". */
  label: string
  /** The page that owns the reference, so the user can go and remove it. */
  href: string
}

/** Where each kind of reference is managed in the admin app. */
export const INVENTORY_BLOCKER_HREF: Record<InventoryBlockerKind, string> = {
  FLOOR_PLAN_ELEMENT: '/admin/events?tab=rooms',
  FLOOR_PLAN_SETUP: '/admin/events?tab=rooms',
  STOCKTAKE: '/admin/ops?tab=inventory&sub=stocktake',
  RECIPE: '/admin/ops?tab=inventory&sub=recipes',
  TASK: '/admin/execution?tab=tasks',
  PRODUCT_LINK: '/admin/ops?tab=inventory&sub=menu-items',
  SERVE: '/admin/ops?tab=inventory&sub=menu-items',
  MENU_LINE: '/admin/ops?tab=menu&sub=menus',
  SUPPLIER_CODE: '/admin/settings?tab=suppliers',
  PURCHASE_ORDER: '/admin/ops?tab=inventory&sub=purchasing',
  INVOICE: '/admin/ops?tab=inventory&sub=invoices',
  DELIVERY: '/admin/compliance?tab=deliveries',
  FURNITURE_BOM: '/admin/ops?tab=inventory',
  SUPPLIER_ALIAS: '/admin/settings?tab=suppliers',
  PRICE_MOVEMENT: '/admin/ops?tab=inventory&sub=invoices',
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** Plain-English description of one blocker row. */
export function describeInventoryBlocker(kind: InventoryBlockerKind, count: number): string {
  const n = Math.max(0, Math.floor(count))
  switch (kind) {
    case 'FLOOR_PLAN_ELEMENT':
      return `Used on ${plural(n, 'a floor plan element', `${n} floor plan elements`)}`
    case 'FLOOR_PLAN_SETUP':
      return `Placed in ${plural(n, 'a floor plan setup', `${n} floor plan setups`)}`
    case 'STOCKTAKE':
      return `Counted in ${plural(n, 'a stocktake', `${n} stocktakes`)}`
    case 'RECIPE':
      return `Used in ${plural(n, 'a recipe', `${n} recipes`)}`
    case 'TASK':
      return `Linked to ${plural(n, 'a task', `${n} tasks`)}`
    case 'PRODUCT_LINK':
      return `Linked to ${plural(n, 'a menu product', `${n} menu products`)}`
    case 'SERVE':
      return `Used as a serve on ${plural(n, 'a menu product', `${n} menu products`)}`
    case 'MENU_LINE':
      return `Listed on ${plural(n, 'a menu', `${n} menus`)}`
    case 'SUPPLIER_CODE':
      return `Has ${plural(n, 'a supplier code', `${n} supplier codes`)}`
    case 'PURCHASE_ORDER':
      return `On ${plural(n, 'a purchase order', `${n} purchase orders`)}`
    case 'INVOICE':
      return `On ${plural(n, 'a supplier invoice', `${n} supplier invoices`)}`
    case 'DELIVERY':
      return `On ${plural(n, 'a delivery record', `${n} delivery records`)}`
    case 'FURNITURE_BOM':
      return `Used on ${plural(n, "a furniture bill of materials", `${n} furniture bills of materials`)}`
    case 'SUPPLIER_ALIAS':
      return `Remembered as ${plural(n, 'a supplier item name', `${n} supplier item names`)}`
    case 'PRICE_MOVEMENT':
      return `Has ${plural(n, 'a price history entry', `${n} price history entries`)}`
    default:
      return 'Still in use'
  }
}

/** Fixed, human-friendly order for the blocker list. */
export const INVENTORY_BLOCKER_ORDER: InventoryBlockerKind[] = [
  'FLOOR_PLAN_ELEMENT',
  'FLOOR_PLAN_SETUP',
  'STOCKTAKE',
  'RECIPE',
  'TASK',
  'PRODUCT_LINK',
  'SERVE',
  'MENU_LINE',
  'SUPPLIER_CODE',
  'PURCHASE_ORDER',
  'INVOICE',
  'DELIVERY',
  'FURNITURE_BOM',
  'SUPPLIER_ALIAS',
  'PRICE_MOVEMENT',
]

/** Stable, deterministic ordering for a list of blockers. */
export function sortInventoryBlockers(blockers: InventoryBlocker[]): InventoryBlocker[] {
  const rank = new Map(INVENTORY_BLOCKER_ORDER.map((kind, i) => [kind, i]))
  return [...blockers].sort((a, b) => (rank.get(a.kind) ?? 999) - (rank.get(b.kind) ?? 999))
}

/** Summary sentence shown above the blocker list. */
export function summariseInventoryBlockers(blockers: InventoryBlocker[]): string {
  const total = blockers.reduce((sum, b) => sum + b.count, 0)
  if (total === 0) return ''
  return `This item is still in use (${total} ${total === 1 ? 'link' : 'links'}). Remove it from the places below, or cancel.`
}
