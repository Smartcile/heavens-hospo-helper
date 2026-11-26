import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    menuItem: { findFirst: vi.fn(), update: vi.fn() },
    recipe: { count: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { PUT } from './route'

const req = (body: unknown = {}) =>
  ({
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  }) as unknown as NextRequest

const SESSION = { user: { id: 'st1', role: 'ADMIN', venueId: 'v1' } }

describe('/api/admin/menu-items/[id] PUT', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerSession.mockResolvedValue(SESSION)
    guardAccess.mockResolvedValue(null)
    prisma.menuItem.findFirst.mockResolvedValue({
      id: 'm1',
      venueId: 'v1',
      servesMin: null,
      servesMax: null,
    })
    prisma.menuItem.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({ id: 'm1', ...data }),
    )
  })

  it('rejects a negative minQty instead of coercing it to null', async () => {
    const res = await PUT(req({ minQty: -2 }), { params: { id: 'm1' } })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'PRICING VALUES CANNOT BE NEGATIVE' })
    expect(prisma.menuItem.update).not.toHaveBeenCalled()
  })

  it('rejects a negative leadTimeDays instead of coercing it to null', async () => {
    const res = await PUT(req({ leadTimeDays: -1 }), { params: { id: 'm1' } })

    expect(res.status).toBe(400)
    expect(prisma.menuItem.update).not.toHaveBeenCalled()
  })

  it('still saves valid pricing metadata', async () => {
    const res = await PUT(req({ minQty: 20, leadTimeDays: 2 }), { params: { id: 'm1' } })

    expect(res.status).toBe(200)
    expect(prisma.menuItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ minQty: 20, leadTimeDays: 2 }),
      }),
    )
  })
})
