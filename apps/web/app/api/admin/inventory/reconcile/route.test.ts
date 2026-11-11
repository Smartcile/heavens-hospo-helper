import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    wooOrderItem: { findMany: vi.fn() },
    menuItemOptionChoice: { findMany: vi.fn() },
    inventoryItem: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)

  prisma.wooOrderItem.findMany.mockResolvedValue([
    {
      orderId: 'o1',
      qty: 2,
      explodedIngredients: { ingredients: [{ inventoryItemId: 'i1', requiredBaseQty: 100 }] },
      options: [
        { groupId: 'g-side', groupName: 'SIDE', choiceId: 'c1', choiceName: 'SALAD', priceDelta: 3 },
      ],
    },
  ])

  // 50 mL of FLOUR per sold unit at 1.2 g/mL — gram-aware via the density bridge.
  prisma.menuItemOptionChoice.findMany.mockResolvedValue([
    {
      id: 'c1',
      inventoryItemId: 'i1',
      qty: 50,
      uom: { id: 'u-ml', name: 'ML', baseUnit: 'ml', conversionRatio: 1, kind: 'VOLUME' },
      inventoryItem: { densityGramsPerMl: 1.2, weightPerUnitGrams: null },
    },
  ])

  prisma.inventoryItem.findUnique.mockResolvedValue({
    id: 'i1',
    name: 'FLOUR',
    totalQty: 1000,
    densityGramsPerMl: 1.2,
    weightPerUnitGrams: null,
  })
})

describe('POST /api/admin/inventory/reconcile options', () => {
  it('multiplies choice drawdown by line qty and merges it gram-aware', async () => {
    const res = await POST({} as NextRequest)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.reconciledCount).toBe(1)
    expect(body.ordersProcessed).toBe(1)
    // 100 g base + (50 mL × 2 units × 1.2 g/mL = 120 g) = 220 g
    expect(body.details[0]).toMatchObject({
      inventoryItemId: 'i1',
      requiredBaseQty: 220,
      unit: 'G',
    })
  })

  it('is read-only — it never writes a stock count or deduction', async () => {
    await POST({} as NextRequest)

    expect(prisma.inventoryItem.update).not.toHaveBeenCalled()
    expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled()
    expect(prisma.inventoryItem.create).not.toHaveBeenCalled()
  })
})
