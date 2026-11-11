import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma } = vi.hoisted(() => ({
  prisma: {
    menuItemOptionChoice: { findMany: vi.fn() },
  },
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))

import { loadChoiceDrawdowns } from './order-drawdown.server'

beforeEach(() => {
  vi.clearAllMocks()
  prisma.menuItemOptionChoice.findMany.mockResolvedValue([
    {
      id: 'c1',
      inventoryItemId: 'i1',
      qty: 50,
      uom: { id: 'u-ml', name: 'ML', baseUnit: 'ml', conversionRatio: 1, kind: 'VOLUME' },
      inventoryItem: { densityGramsPerMl: 1.2, weightPerUnitGrams: null },
    },
    {
      id: 'c2',
      inventoryItemId: null,
      qty: null,
      uom: null,
      inventoryItem: null,
    },
  ])
})

describe('loadChoiceDrawdowns', () => {
  it('maps choice ids to their live stock drawdown', async () => {
    const map = await loadChoiceDrawdowns(['c1', 'c2'])

    expect(prisma.menuItemOptionChoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['c1', 'c2'] } } }),
    )
    expect(map.get('c1')).toEqual({
      inventoryItemId: 'i1',
      qty: 50,
      uom: { id: 'u-ml', name: 'ML', baseUnit: 'ml', conversionRatio: 1, kind: 'VOLUME' },
      item: { densityGramsPerMl: 1.2, weightPerUnitGrams: null },
    })
    expect(map.get('c2')?.inventoryItemId).toBeNull()
  })

  it('dedupes ids and skips the query when there is nothing to load', async () => {
    const map = await loadChoiceDrawdowns([])
    expect(map.size).toBe(0)
    expect(prisma.menuItemOptionChoice.findMany).not.toHaveBeenCalled()

    await loadChoiceDrawdowns(['c1', 'c1'])
    expect(prisma.menuItemOptionChoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['c1'] } } }),
    )
  })
})
