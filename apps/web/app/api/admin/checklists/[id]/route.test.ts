import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => {
  const checklistEvent = { updateMany: vi.fn(), upsert: vi.fn() }
  return {
    prisma: {
      checklist: { findUnique: vi.fn(), update: vi.fn() },
      calendarEvent: { count: vi.fn() },
      checklistEvent,
      $transaction: vi.fn(),
    },
    getServerSession: vi.fn(),
    guardAccess: vi.fn(),
  }
})

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
  prisma.calendarEvent.count.mockResolvedValue(0)
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
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

describe('PUT /api/admin/checklists/[id] events', () => {
  it('replaces the linked events wholesale', async () => {
    prisma.calendarEvent.count.mockResolvedValue(1)

    const res = await PUT(req({ eventIds: ['e1'] }), { params: { id: 'c1' } })

    expect(res.status).toBe(200)
    expect(prisma.checklistEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { checklistId: 'c1', deletedAt: null, calendarEventId: { notIn: ['e1'] } },
      }),
    )
    expect(prisma.checklistEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { checklistId_calendarEventId: { checklistId: 'c1', calendarEventId: 'e1' } } }),
    )
  })

  it('leaves event links untouched when eventIds is omitted', async () => {
    await PUT(req({ name: 'RENAMED' }), { params: { id: 'c1' } })

    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.checklistEvent.updateMany).not.toHaveBeenCalled()
  })

  it('clears every event link with an empty array', async () => {
    const res = await PUT(req({ eventIds: [] }), { params: { id: 'c1' } })

    expect(res.status).toBe(200)
    expect(prisma.checklistEvent.updateMany).toHaveBeenCalledWith({
      where: { checklistId: 'c1', deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    })
    expect(prisma.checklistEvent.upsert).not.toHaveBeenCalled()
  })

  it('rejects an event from another venue', async () => {
    prisma.calendarEvent.count.mockResolvedValue(0)

    const res = await PUT(req({ eventIds: ['other'] }), { params: { id: 'c1' } })

    expect(res.status).toBe(400)
    expect(prisma.checklist.update).not.toHaveBeenCalled()
  })
})
