import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    purchaseOrder: { findFirst: vi.fn(), update: vi.fn() },
    purchaseOrderLine: { update: vi.fn() },
    inventoryItem: { findMany: vi.fn(), update: vi.fn() },
    supplierItemCode: { findMany: vi.fn(), update: vi.fn() },
    supplierPriceMovement: { create: vi.fn() },
    delivery: { create: vi.fn() },
    deliveryItem: { createMany: vi.fn(), findMany: vi.fn() },
    hsAlert: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { POST } from './route'

const postReq = (body: unknown) =>
  ({ json: async () => body } as unknown as NextRequest)

function orderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'po1',
    venueId: 'v1',
    supplierId: 's1',
    status: 'SENT',
    supplier: { id: 's1', name: 'SUPPLIER ONE' },
    lines: [
      {
        id: 'l1',
        purchaseOrderId: 'po1',
        inventoryItemId: 'i1',
        description: 'APPLES',
        qty: 10,
        unitPrice: 5,
        receivedQty: 0,
        uomId: null,
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] } })
  guardAccess.mockResolvedValue(null)
  prisma.purchaseOrder.findFirst.mockResolvedValue(orderFixture())
  prisma.inventoryItem.findMany.mockResolvedValue([
    { id: 'i1', name: 'APPLES', unit: 'KG', storageType: 'CHILLED', costPrice: 5 },
  ])
  prisma.supplierItemCode.findMany.mockResolvedValue([])
  prisma.delivery.create.mockResolvedValue({ id: 'd1' })
  prisma.deliveryItem.createMany.mockResolvedValue({ count: 1 })
  prisma.deliveryItem.findMany.mockResolvedValue([])
  prisma.purchaseOrderLine.update.mockResolvedValue({})
  prisma.inventoryItem.update.mockResolvedValue({})
  prisma.supplierItemCode.update.mockResolvedValue({})
  prisma.supplierPriceMovement.create.mockResolvedValue({})
  prisma.purchaseOrder.update.mockImplementation(async ({ data }: { data: { status: string } }) => ({
    id: 'po1',
    status: data.status,
  }))
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
})

describe('POST /api/admin/purchase-orders/[id]/receive', () => {
  it('returns 401 without a session', async () => {
    getServerSession.mockResolvedValue(null)
    const res = await POST(postReq({ lines: [{ lineId: 'l1', qty: 1 }] }), { params: { id: 'po1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the order is not in the caller venue', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue(null)
    const res = await POST(postReq({ lines: [{ lineId: 'l1', qty: 1 }] }), { params: { id: 'po1' } })
    expect(res.status).toBe(404)
  })

  it('records a partial receipt and moves the order to PARTIALLY_RECEIVED', async () => {
    const res = await POST(postReq({ lines: [{ lineId: 'l1', qty: 4 }] }), { params: { id: 'po1' } })
    expect(res.status).toBe(200)

    expect(prisma.purchaseOrderLine.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { receivedQty: 4 },
    })
    expect(prisma.purchaseOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PARTIALLY_RECEIVED' } }),
    )
    expect(prisma.deliveryItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ purchaseOrderLineId: 'l1', inventoryItemId: 'i1', qty: 4 })],
    })
  })

  it('records a full receipt and moves the order to RECEIVED', async () => {
    await POST(postReq({ lines: [{ lineId: 'l1', qty: 10 }] }), { params: { id: 'po1' } })
    expect(prisma.purchaseOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'RECEIVED' } }),
    )
  })

  it('a changed price creates a SupplierPriceMovement and updates the item cost', async () => {
    prisma.supplierItemCode.findMany.mockResolvedValue([
      { id: 'c1', supplierId: 's1', inventoryItemId: 'i1', supplierSku: 'SKU1', purchasePrice: 5 },
    ])

    const res = await POST(
      postReq({ lines: [{ lineId: 'l1', qty: 2, unitPrice: 6 }] }),
      { params: { id: 'po1' } },
    )
    const body = await res.json()

    expect(body.priceMovements).toHaveLength(1)
    expect(body.priceMovements[0]).toMatchObject({ inventoryItemId: 'i1', oldPrice: 5, newPrice: 6 })
    expect(prisma.supplierPriceMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inventoryItemId: 'i1',
        source: 'RECEIPT',
        sourceId: 'd1',
        oldPrice: 5,
        newPrice: 6,
        delta: 1,
      }),
    })
    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { costPrice: 6 },
    })
    expect(prisma.supplierItemCode.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { purchasePrice: 6, deletedAt: null },
    })
  })
})
