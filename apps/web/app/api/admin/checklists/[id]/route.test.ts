import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: { checklist: { findUnique: vi.fn(), update: vi.fn() } },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/notice-audience', () => ({ cleanNoticeAudiences: vi.fn((a: unknown) => a ?? []) }))

import { PUT } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  prisma.checklist.findUnique.mockResolvedValue({ venueId: 'v1' })
  prisma.checklist.update.mockResolvedValue({ id: 'c1' })
})

describe('PUT /api/admin/checklists/[id] schedules', () => {
  it('replaces the schedule wholesale', async () => {
    const res = await PUT(
      req({ schedules: [{ dayOfWeek: 5, fromTime: '12:00' }] }),
      { params: { id: 'c1' } },
    )

    expect(res.status).toBe(200)
    const data = prisma.checklist.update.mock.calls[0][0].data
    expect(data.schedules).toEqual({
      updateMany: { where: { deletedAt: null }, data: { deletedAt: expect.any(Date) } },
      create: [{ dayOfWeek: 5, fromTime: '12:00', toTime: null }],
    })
  })

  it('leaves the schedule untouched when omitted', async () => {
    await PUT(req({ name: 'RENAMED' }), { params: { id: 'c1' } })

    expect(prisma.checklist.update.mock.calls[0][0].data).not.toHaveProperty('schedules')
  })

  it('rejects an invalid day-of-week', async () => {
    const res = await PUT(
      req({ schedules: [{ dayOfWeek: -1, fromTime: '08:00' }] }),
      { params: { id: 'c1' } },
    )

    expect(res.status).toBe(400)
    expect(prisma.checklist.update).not.toHaveBeenCalled()
  })

  it('keeps the manager venue check', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'vm' } })
    prisma.checklist.findUnique.mockResolvedValue({ venueId: 'other' })

    const res = await PUT(req({ name: 'RENAMED' }), { params: { id: 'c1' } })

    expect(res.status).toBe(403)
    expect(prisma.checklist.update).not.toHaveBeenCalled()
  })
})
