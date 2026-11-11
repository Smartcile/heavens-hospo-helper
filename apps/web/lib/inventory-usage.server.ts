// DB half of inventory delete protection. Every relation on InventoryItem is
// counted here, so a soft delete (and the permanent-purge path) refuses to
// break a floor plan, stocktake, recipe or purchase record.
//
// Default mode ignores soft-deleted parents/rows — they are no longer "in use".
// `includeDeletedParents` (used for `?permanent=1`) counts every PHYSICAL row
// instead: a soft-deleted supplier code / alias / price movement / delivery or
// stocktake line still carries a required FK, so a hard delete would throw
// P2003 even though it was hidden from the soft-delete check.

import { prisma } from '@hospo-ops/db'
import {
  describeInventoryBlocker,
  INVENTORY_BLOCKER_HREF,
  sortInventoryBlockers,
  type InventoryBlocker,
  type InventoryBlockerKind,
} from './inventory-usage'

export interface FindInventoryBlockersOptions {
  /**
   * Permanent purge: count physical rows regardless of soft-deleted parents
   * or child rows. Returns the same 409 blocker list.
   */
  includeDeletedParents?: boolean
}

export async function findInventoryBlockers(
  itemId: string,
  options: FindInventoryBlockersOptions = {},
): Promise<InventoryBlocker[]> {
  const live = !options.includeDeletedParents

  const counts = await Promise.all([
    // Floor plans: base-plan elements and placed furniture in a setup.
    prisma.elementInventoryItem.count({
      where: { itemId, ...(live ? { element: { deletedAt: null } } : {}) },
    }),
    prisma.setupItem.count({
      where: {
        furnitureItemId: itemId,
        ...(live ? { deletedAt: null, setup: { deletedAt: null } } : {}),
      },
    }),
    // Stocktake counts.
    prisma.stocktakeLineItem.count({
      where: { itemId, ...(live ? { record: { deletedAt: null } } : {}) },
    }),
    // Recipe ingredients / sub-recipes.
    prisma.recipeLineItem.count({
      where: { inventoryItemId: itemId, ...(live ? { recipe: { deletedAt: null } } : {}) },
    }),
    // Task item links (H&S readings and everyday tasks).
    prisma.task.count({
      where: { linkedItemId: itemId, ...(live ? { deletedAt: null } : {}) },
    }),
    // Product equipment / stock links and POS serves.
    prisma.menuItemInventoryItem.count({
      where: {
        inventoryItemId: itemId,
        ...(live ? { deletedAt: null, menuItem: { deletedAt: null } } : {}),
      },
    }),
    prisma.menuItemServe.count({
      where: {
        inventoryItemId: itemId,
        ...(live ? { deletedAt: null, menuItem: { deletedAt: null } } : {}),
      },
    }),
    // Stock lines on a menu.
    prisma.menuMenuItem.count({
      where: { inventoryItemId: itemId, ...(live ? { menu: { deletedAt: null } } : {}) },
    }),
    // Supplier SKU / recognition memory.
    prisma.supplierItemCode.count({
      where: { inventoryItemId: itemId, ...(live ? { deletedAt: null } : {}) },
    }),
    // Purchasing / receiving / invoicing history.
    prisma.purchaseOrderLine.count({
      where: {
        inventoryItemId: itemId,
        ...(live ? { deletedAt: null, purchaseOrder: { deletedAt: null } } : {}),
      },
    }),
    prisma.supplierInvoiceLine.count({
      where: {
        inventoryItemId: itemId,
        ...(live ? { deletedAt: null, invoice: { deletedAt: null } } : {}),
      },
    }),
    prisma.deliveryItem.count({
      where: {
        inventoryItemId: itemId,
        ...(live ? { deletedAt: null, delivery: { deletedAt: null } } : {}),
      },
    }),
    // This item as a component of furniture (the parent furniture's own BOM is
    // owned by the furniture and does not block).
    prisma.furnitureBomItem.count({
      where: { inventoryItemId: itemId, ...(live ? { furniture: { deletedAt: null } } : {}) },
    }),
    prisma.supplierItemAlias.count({
      where: { inventoryItemId: itemId, ...(live ? { deletedAt: null } : {}) },
    }),
    prisma.supplierPriceMovement.count({
      where: { inventoryItemId: itemId, ...(live ? { deletedAt: null } : {}) },
    }),
  ])

  const kinds: InventoryBlockerKind[] = [
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

  return sortInventoryBlockers(
    kinds
      .map((kind, i) => ({ kind, count: counts[i] }))
      .filter((row) => row.count > 0)
      .map((row) => ({
        kind: row.kind,
        count: row.count,
        label: describeInventoryBlocker(row.kind, row.count),
        href: INVENTORY_BLOCKER_HREF[row.kind],
      })),
  )
}
