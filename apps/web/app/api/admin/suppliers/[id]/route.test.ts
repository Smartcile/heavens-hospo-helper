import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    supplier: { findFirst: vi.fn(), update: vi.fn() },
    guide: { findFirst: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { PUT } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)
const params = { params: { id: 's1' } }

describe('PUT /api/admin/suppliers/[id] drop-off guide', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
    guardAccess.mockResolvedValue(null)
    prisma.supplier.findFirst.mockResolvedValue({ id: 's1', venueId: 'v1' })
    prisma.guide.findFirst.mockResolvedValue({ id: 'g1' })
    prisma.supplier.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 's1',
      ...data,
      dropOffGuide: null,
    }))
  })

  it('assigns a live SUPPLIER_INFO guide from the same venue', async () => {
    const res = await PUT(req({ dropOffGuideId: 'g1' }), params)

    expect(res.status).toBe(200)
    expect(prisma.guide.findFirst).toHaveBeenCalledWith({
      where: { id: 'g1', venueId: 'v1', deletedAt: null, guideType: 'SUPPLIER_INFO' },
      select: { id: true },
    })
    expect(prisma.supplier.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dropOffGuideId: 'g1' }) }),
    )
  })

  it('allows a DRAFT guide (the UI warns to publish it)', async () => {
    const res = await PUT(req({ dropOffGuideId: 'g1' }), params)

    expect(res.status).toBe(200)
    expect(prisma.supplier.update).toHaveBeenCalled()
  })

  it('rejects a guide that is not a live SUPPLIER_INFO guide in this venue', async () => {
    prisma.guide.findFirst.mockResolvedValue(null)

    const res = await PUT(req({ dropOffGuideId: 'g-cross-venue' }), params)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/SUPPLIER INFO GUIDE/)
    expect(prisma.supplier.update).not.toHaveBeenCalled()
  })

  it('clears the link with a null id', async () => {
    const res = await PUT(req({ dropOffGuideId: null }), params)

    expect(res.status).toBe(200)
    expect(prisma.guide.findFirst).not.toHaveBeenCalled()
    expect(prisma.supplier.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dropOffGuideId: null }) }),
    )
  })

  it('leaves the link untouched when the field is omitted', async () => {
    await PUT(req({ notes: 'NEW NOTE' }), params)

    expect(prisma.guide.findFirst).not.toHaveBeenCalled()
    expect(prisma.supplier.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { notes: 'NEW NOTE' } }),
    )
  })

  it('still blocks a manager editing another venue’s supplier', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'v-other' } })

    const res = await PUT(req({ dropOffGuideId: 'g1' }), params)

    expect(res.status).toBe(403)
    expect(prisma.supplier.update).not.toHaveBeenCalled()
  })
})
