import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    supplier: { findFirst: vi.fn() },
    supplierInvoice: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    inventoryItem: { findMany: vi.fn(), create: vi.fn() },
    purchaseOrder: { findFirst: vi.fn() },
    supplierItemCode: { upsert: vi.fn() },
    supplierItemAlias: { upsert: vi.fn() },
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

const header = { invoiceNumber: 'INV-1', invoiceDate: '2026-11-01' }

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] } })
  guardAccess.mockResolvedValue(null)
  prisma.supplier.findFirst.mockResolvedValue({ id: 's1' })
  prisma.supplierInvoice.findFirst.mockResolvedValue(null)
  prisma.inventoryItem.findMany.mockResolvedValue([{ id: 'i1' }])
  prisma.supplierInvoice.create.mockResolvedValue({ id: 'inv1' })
  prisma.supplierInvoice.findUnique.mockResolvedValue({
    id: 'inv1',
    number: 'INV-1',
    lines: [],
    supplier: { id: 's1', name: 'SUPPLIER ONE' },
  })
  prisma.supplierItemCode.upsert.mockResolvedValue({})
  prisma.supplierItemAlias.upsert.mockResolvedValue({})
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
})

describe('POST /api/admin/supplier-invoices/import/commit', () => {
  it('stores unmatched lines as UNMATCHED and never creates inventory items', async () => {
    const res = await POST(
      postReq({
        supplierId: 's1',
        header,
        lines: [{ description: 'MYSTERY THING', qty: 2, unitPrice: 3 }],
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.summary.unmatched).toBe(1)
    expect(prisma.inventoryItem.create).not.toHaveBeenCalled()
    const create = prisma.supplierInvoice.create.mock.calls[0][0]
    expect(create.data.lines.create[0]).toMatchObject({
      inventoryItemId: null,
      matchStatus: 'UNMATCHED',
    })
    expect(create.data.status).toBe('PENDING_MATCH')
  })

  it('returns 409 for a duplicate invoice number without writing', async () => {
    prisma.supplierInvoice.findFirst.mockResolvedValue({ id: 'existing' })

    const res = await POST(postReq({ supplierId: 's1', header, lines: [] }))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.invoiceId).toBe('existing')
    expect(prisma.supplierInvoice.create).not.toHaveBeenCalled()
  })

  it('upserts SupplierItemCode and an alias for a matched line', async () => {
    const res = await POST(
      postReq({
        supplierId: 's1',
        header,
        lines: [{ inventoryItemId: 'i1', supplierSku: 'SKU1', description: 'APPLES', qty: 1, unitPrice: 2 }],
      }),
    )
    const body = await res.json()

    expect(body.summary.matched).toBe(1)
    expect(body.summary.itemCodes).toBe(1)
    expect(body.summary.aliases).toBe(1)
    expect(prisma.supplierItemCode.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { supplierId_inventoryItemId: { supplierId: 's1', inventoryItemId: 'i1' } },
        update: expect.objectContaining({ supplierSku: 'SKU1', deletedAt: null }),
      }),
    )
    expect(prisma.supplierItemAlias.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { supplierId_normalisedTextKey: { supplierId: 's1', normalisedTextKey: 'APPLES' } },
      }),
    )
  })

  it('flags VARIANCE when the line differs from the linked purchase order line', async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: 'po1',
      lines: [{ id: 'pl1', inventoryItemId: 'i1', description: 'APPLES', qty: 10, unitPrice: 5 }],
    })

    const res = await POST(
      postReq({
        supplierId: 's1',
        purchaseOrderId: 'po1',
        header,
        lines: [{ inventoryItemId: 'i1', description: 'APPLES', qty: 10, unitPrice: 6 }],
      }),
    )
    const body = await res.json()

    expect(body.summary.variance).toBe(1)
    const create = prisma.supplierInvoice.create.mock.calls[0][0]
    expect(create.data.lines.create[0]).toMatchObject({
      matchStatus: 'VARIANCE',
      purchaseOrderLineId: 'pl1',
    })
    expect(create.data.status).toBe('VARIANCE')
  })
})
