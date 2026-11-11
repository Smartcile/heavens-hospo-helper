// DB half of inventory delete protection. Every live relation on
// InventoryItem is counted here, so a soft delete (and the permanent-purge
// path) refuses to break a floor plan, stocktake, recipe or purchase record.
// Soft-deleted parents are ignored — they are no longer "in use".

import { prisma } from '@hospo-ops/db'
import {
  describeInventoryBlocker,
  INVENTORY_BLOCKER_HREF,
  sortInventoryBlockers,
  type InventoryBlocker,
  type InventoryBlockerKind,
} from './inventory-usage'

export async function findInventoryBlockers(itemId: string): Promise<InventoryBlocker[]> {
  const counts = await Promise.all([
    // Floor plans: base-plan elements and placed furniture in a setup.
    prisma.elementInventoryItem.count({
      where: { itemId, element: { deletedAt: null } },
    }),
    prisma.setupItem.count({
      where: { furnitureItemId: itemId, deletedAt: null, setup: { deletedAt: null } },
    }),
    // Stocktake counts.
    prisma.stocktakeLineItem.count({
      where: { itemId, record: { deletedAt: null } },
    }),
    // Recipe ingredients / sub-recipes.
    prisma.recipeLineItem.count({
      where: { inventoryItemId: itemId, recipe: { deletedAt: null } },
    }),
    // Task item links (H&S readings and everyday tasks).
    prisma.task.count({
      where: { linkedItemId: itemId, deletedAt: null },
    }),
    // Product equipment / stock links and POS serves.
    prisma.menuItemInventoryItem.count({
      where: { inventoryItemId: itemId, deletedAt: null, menuItem: { deletedAt: null } },
    }),
    prisma.menuItemServe.count({
      where: { inventoryItemId: itemId, deletedAt: null, menuItem: { deletedAt: null } },
    }),
    // Stock lines on a menu.
    prisma.menuMenuItem.count({
      where: { inventoryItemId: itemId, menu: { deletedAt: null } },
    }),
    // Supplier SKU / recognition memory.
    prisma.supplierItemCode.count({
      where: { inventoryItemId: itemId, deletedAt: null },
    }),
    // Purchasing / receiving / invoicing history.
    prisma.purchaseOrderLine.count({
      where: { inventoryItemId: itemId, deletedAt: null, purchaseOrder: { deletedAt: null } },
    }),
    prisma.supplierInvoiceLine.count({
      where: { inventoryItemId: itemId, deletedAt: null, invoice: { deletedAt: null } },
    }),
    prisma.deliveryItem.count({
      where: { inventoryItemId: itemId, deletedAt: null, delivery: { deletedAt: null } },
    }),
    // This item as a component of furniture (the parent furniture's own BOM is
    // owned by the furniture and does not block).
    prisma.furnitureBomItem.count({
      where: { inventoryItemId: itemId, furniture: { deletedAt: null } },
    }),
    prisma.supplierItemAlias.count({
      where: { inventoryItemId: itemId, deletedAt: null },
    }),
    prisma.supplierPriceMovement.count({
      where: { inventoryItemId: itemId, deletedAt: null },
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
