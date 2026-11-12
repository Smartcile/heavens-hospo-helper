import { beforeEach, describe, expect, it, vi } from 'vitest'

const models = [
  'elementInventoryItem',
  'setupItem',
  'stocktakeLineItem',
  'recipeLineItem',
  'task',
  'menuItemInventoryItem',
  'menuItemServe',
  'menuItemOptionChoice',
  'menuMenuItem',
  'supplierItemCode',
  'purchaseOrderLine',
  'supplierInvoiceLine',
  'deliveryItem',
  'furnitureBomItem',
  'supplierItemAlias',
  'supplierPriceMovement',
] as const

const { prisma } = vi.hoisted(() => {
  const names = [
    'elementInventoryItem',
    'setupItem',
    'stocktakeLineItem',
    'recipeLineItem',
    'task',
    'menuItemInventoryItem',
    'menuItemServe',
    'menuItemOptionChoice',
    'menuMenuItem',
    'supplierItemCode',
    'purchaseOrderLine',
    'supplierInvoiceLine',
    'deliveryItem',
    'furnitureBomItem',
    'supplierItemAlias',
    'supplierPriceMovement',
  ]
  return {
    prisma: Object.fromEntries(names.map((name) => [name, { count: vi.fn() }])),
  }
})

vi.mock('@hospo-ops/db', () => ({ prisma }))

import { findInventoryBlockers } from './inventory-usage.server'

function zeroAll() {
  for (const name of models) {
    ;(prisma as Record<string, { count: ReturnType<typeof vi.fn> }>)[name].count.mockResolvedValue(0)
  }
}

describe('findInventoryBlockers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    zeroAll()
  })

  it('returns no blockers when the item is not referenced', async () => {
    expect(await findInventoryBlockers('i1')).toEqual([])
  })

  it('reports each reference kind with a label, count and management page', async () => {
    const cases: { model: (typeof models)[number]; kind: string; label: string }[] = [
      { model: 'elementInventoryItem', kind: 'FLOOR_PLAN_ELEMENT', label: 'Used on 2 floor plan elements' },
      { model: 'setupItem', kind: 'FLOOR_PLAN_SETUP', label: 'Placed in a floor plan setup' },
      { model: 'stocktakeLineItem', kind: 'STOCKTAKE', label: 'Counted in a stocktake' },
      { model: 'recipeLineItem', kind: 'RECIPE', label: 'Used in a recipe' },
      { model: 'task', kind: 'TASK', label: 'Linked to a task' },
      { model: 'menuItemInventoryItem', kind: 'PRODUCT_LINK', label: 'Linked to a menu product' },
      { model: 'menuItemServe', kind: 'SERVE', label: 'Used as a serve on a menu product' },
      { model: 'menuItemOptionChoice', kind: 'MENU_OPTION', label: 'Used as a product option on a menu product' },
      { model: 'menuMenuItem', kind: 'MENU_LINE', label: 'Listed on a menu' },
      { model: 'supplierItemCode', kind: 'SUPPLIER_CODE', label: 'Has a supplier code' },
      { model: 'purchaseOrderLine', kind: 'PURCHASE_ORDER', label: 'On a purchase order' },
      { model: 'supplierInvoiceLine', kind: 'INVOICE', label: 'On a supplier invoice' },
      { model: 'deliveryItem', kind: 'DELIVERY', label: 'On a delivery record' },
      { model: 'furnitureBomItem', kind: 'FURNITURE_BOM', label: 'Used on a furniture bill of materials' },
      { model: 'supplierItemAlias', kind: 'SUPPLIER_ALIAS', label: 'Remembered as a supplier item name' },
      { model: 'supplierPriceMovement', kind: 'PRICE_MOVEMENT', label: 'Has a price history entry' },
    ]

    for (const testCase of cases) {
      zeroAll()
      const count = testCase.kind === 'FLOOR_PLAN_ELEMENT' ? 2 : 1
      ;(prisma as Record<string, { count: ReturnType<typeof vi.fn> }>)[testCase.model].count.mockResolvedValue(count)

      const blockers = await findInventoryBlockers('i1')
      expect(blockers).toHaveLength(1)
      expect(blockers[0]).toMatchObject({ kind: testCase.kind, count, label: testCase.label })
      expect(blockers[0].href).toMatch(/^\/admin\//)
    }
  })

  it('ignores soft-deleted parents so deleted records do not block', async () => {
    await findInventoryBlockers('i1')

    expect(prisma.elementInventoryItem.count).toHaveBeenCalledWith({
      where: { itemId: 'i1', element: { deletedAt: null } },
    })
    expect(prisma.recipeLineItem.count).toHaveBeenCalledWith({
      where: { inventoryItemId: 'i1', recipe: { deletedAt: null } },
    })
    expect(prisma.task.count).toHaveBeenCalledWith({
      where: { linkedItemId: 'i1', deletedAt: null },
    })
    expect(prisma.supplierItemCode.count).toHaveBeenCalledWith({
      where: { inventoryItemId: 'i1', deletedAt: null },
    })
    expect(prisma.furnitureBomItem.count).toHaveBeenCalledWith({
      where: { inventoryItemId: 'i1', furniture: { deletedAt: null } },
    })
    expect(prisma.menuItemOptionChoice.count).toHaveBeenCalledWith({
      where: {
        inventoryItemId: 'i1',
        deletedAt: null,
        group: { deletedAt: null, menuItem: { deletedAt: null } },
      },
    })
  })

  it('counts every physical row for a permanent purge, including soft-deleted parents', async () => {
    await findInventoryBlockers('i1', { includeDeletedParents: true })

    // Required FKs that would throw P2003 on a hard delete even when the
    // parent (or the link row itself) was soft-deleted.
    expect(prisma.stocktakeLineItem.count).toHaveBeenCalledWith({
      where: { itemId: 'i1' },
    })
    expect(prisma.supplierItemCode.count).toHaveBeenCalledWith({
      where: { inventoryItemId: 'i1' },
    })
    expect(prisma.supplierItemAlias.count).toHaveBeenCalledWith({
      where: { inventoryItemId: 'i1' },
    })
    expect(prisma.supplierPriceMovement.count).toHaveBeenCalledWith({
      where: { inventoryItemId: 'i1' },
    })
    expect(prisma.deliveryItem.count).toHaveBeenCalledWith({
      where: { inventoryItemId: 'i1' },
    })
    expect(prisma.elementInventoryItem.count).toHaveBeenCalledWith({
      where: { itemId: 'i1' },
    })
    expect(prisma.setupItem.count).toHaveBeenCalledWith({
      where: { furnitureItemId: 'i1' },
    })
    expect(prisma.task.count).toHaveBeenCalledWith({
      where: { linkedItemId: 'i1' },
    })
    expect(prisma.menuItemOptionChoice.count).toHaveBeenCalledWith({
      where: { inventoryItemId: 'i1' },
    })
  })
})
