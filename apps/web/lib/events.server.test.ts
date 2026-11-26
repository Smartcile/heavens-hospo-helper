import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  menuMenuItem: { findMany: vi.fn(async () => [] as unknown[]) },
  menuGroup: { findMany: vi.fn(async () => [] as unknown[]) },
}))

vi.mock('@hospo-ops/db', () => ({ prisma: db, Prisma: {} }))
vi.mock('@/lib/public-api', () => ({ hashApiKey: (s: string) => s }))
vi.mock('@/lib/beo-blocks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/beo-blocks')>('@/lib/beo-blocks')
  return actual
})

import { buildEventData, buildEventPricing } from './events.server'

describe('buildEventData', () => {
  it('accepts an areaId (the room the event occupies)', () => {
    const { data, error } = buildEventData({ areaId: 'a1' })
    expect(error).toBeUndefined()
    expect(data.areaId).toBe('a1')
  })

  it('clears the room when areaId is blank or null', () => {
    expect(buildEventData({ areaId: '' }).data.areaId).toBeNull()
    expect(buildEventData({ areaId: null }).data.areaId).toBeNull()
  })

  it('leaves the room untouched when areaId is omitted', () => {
    expect(buildEventData({ name: 'WEDDING' }).data).not.toHaveProperty('areaId')
  })
})

describe('buildEventPricing (#192)', () => {
  beforeEach(() => {
    db.menuMenuItem.findMany.mockReset()
    db.menuMenuItem.findMany.mockResolvedValue([])
    db.menuGroup.findMany.mockReset()
    db.menuGroup.findMany.mockResolvedValue([])
  })

  it('lets a menu line minQty win over the product default', async () => {
    db.menuMenuItem.findMany.mockResolvedValue([{ menuItemId: 'm1', minQty: 20 }])
    const { menuItems } = await buildEventPricing({ menuId: 'menu1' }, [
      { id: 'm1', name: 'CANAPE', price: 4, minQty: 5 },
      { id: 'm2', name: 'OTHER', price: 9, minQty: 2 },
    ])
    expect(menuItems.find((m) => m.id === 'm1')?.minQty).toBe(20)
    expect(menuItems.find((m) => m.id === 'm2')?.minQty).toBe(2)
  })

  it('prices a PER_PERSON bound menu as a package and passes its choice groups', async () => {
    db.menuGroup.findMany.mockResolvedValue([
      { id: 'g1', name: 'MAIN', minSelect: 1, maxSelect: 1 },
    ])
    const { options } = await buildEventPricing(
      {
        menuId: 'menu1',
        menu: { id: 'menu1', name: 'SET', pricingMode: 'PER_PERSON', pricePerPerson: 95, deletedAt: null },
      },
      [],
    )
    expect(options.package).toEqual({ id: 'menu1', name: 'SET', price: 95 })
    expect(options.packages).toEqual([{ id: 'menu1', name: 'SET', price: 95 }])
    expect(options.choiceGroups).toEqual([{ id: 'g1', name: 'MAIN', minSelect: 1, maxSelect: 1 }])
    expect(options.missingPackage).toBeUndefined()
  })

  it('does not package a menu that is sold EACH', async () => {
    const { options } = await buildEventPricing(
      {
        menuId: 'menu1',
        menu: { id: 'menu1', name: 'A LA CARTE', pricingMode: null, pricePerPerson: null, deletedAt: null },
      },
      [],
    )
    expect(options.package).toBeUndefined()
    expect(options.missingPackage).toBeUndefined()
  })

  it('reports a soft-deleted bound menu as missing, never a $0 package', async () => {
    const { options } = await buildEventPricing(
      {
        menuId: 'menu1',
        menu: {
          id: 'menu1',
          name: 'OLD SET MENU',
          pricingMode: 'PER_PERSON',
          pricePerPerson: 95,
          deletedAt: new Date(),
        },
      },
      [],
    )
    expect(options.package).toBeUndefined()
    expect(options.missingPackage).toEqual({ id: 'menu1', name: 'OLD SET MENU' })
  })
})
