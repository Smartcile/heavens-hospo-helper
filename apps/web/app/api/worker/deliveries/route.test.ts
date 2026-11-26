import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma, getWorkerSession } = vi.hoisted(() => ({
  prisma: {
    delivery: { findMany: vi.fn() },
    inventoryItem: { findMany: vi.fn() },
    supplier: { findMany: vi.fn() },
  },
  getWorkerSession: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))

import { GET } from './route'

const request = {} as Parameters<typeof GET>[0]

describe('GET /api/worker/deliveries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWorkerSession.mockResolvedValue({ staffId: 'st1', venueId: 'v1', firstName: 'ALEX', role: 'STAFF' })
    prisma.delivery.findMany.mockResolvedValue([])
    prisma.inventoryItem.findMany.mockResolvedValue([])
    prisma.supplier.findMany.mockResolvedValue([
      {
        id: 's1',
        name: 'BIDFOOD',
        dropOffGuide: { id: 'g1', title: 'BIDFOOD DROP-OFF', status: 'PUBLISHED', guideType: 'SUPPLIER_INFO', deletedAt: null },
      },
      {
        id: 's2',
        name: 'NEW WORLD',
        dropOffGuide: { id: 'g2', title: 'DRAFT DROP-OFF', status: 'DRAFT', guideType: 'SUPPLIER_INFO', deletedAt: null },
      },
      {
        id: 's3',
        name: 'OLD SUPPLIER',
        dropOffGuide: { id: 'g3', title: 'DELETED DROP-OFF', status: 'PUBLISHED', guideType: 'SUPPLIER_INFO', deletedAt: new Date() },
      },
      {
        id: 's5',
        name: 'RE-TYPED SUPPLIER',
        dropOffGuide: { id: 'g4', title: 'NOW A HOW TO', status: 'PUBLISHED', guideType: 'HOW_TO', deletedAt: null },
      },
      { id: 's4', name: 'NO GUIDE', dropOffGuide: null },
    ])
  })

  it('requires a worker session', async () => {
    getWorkerSession.mockResolvedValue(null)

    const res = await GET(request)

    expect(res.status).toBe(401)
    expect(prisma.supplier.findMany).not.toHaveBeenCalled()
  })

  it('returns only PUBLISHED, live drop-off guides to the phone', async () => {
    const res = await GET(request)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(prisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { venueId: 'v1', deletedAt: null, isActive: true },
        select: expect.objectContaining({
          dropOffGuide: { select: { id: true, title: true, status: true, guideType: true, deletedAt: true } },
        }),
      }),
    )
    expect(body.suppliers).toEqual([
      { id: 's1', name: 'BIDFOOD', dropOffGuide: { id: 'g1', title: 'BIDFOOD DROP-OFF', status: 'PUBLISHED' } },
      { id: 's2', name: 'NEW WORLD', dropOffGuide: null },
      { id: 's3', name: 'OLD SUPPLIER', dropOffGuide: null },
      { id: 's5', name: 'RE-TYPED SUPPLIER', dropOffGuide: null },
      { id: 's4', name: 'NO GUIDE', dropOffGuide: null },
    ])
  })
})
