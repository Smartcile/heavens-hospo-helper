import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => {
  const checklistEvent = { updateMany: vi.fn(), upsert: vi.fn() }
  return {
    prisma: {
      checklist: { findMany: vi.fn(), create: vi.fn() },
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

import { GET, POST } from './route'

const req = (body?: unknown) =>
  ({ json: async () => body ?? {} } as unknown as NextRequest)

function getRequest(url: string) {
  return { url, nextUrl: new URL(url), json: async () => ({}) } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  prisma.checklist.create.mockResolvedValue({ id: 'c1' })
  prisma.calendarEvent.count.mockResolvedValue(0)
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
})

describe('/api/admin/checklists schedules', () => {
  it('creates a checklist with schedule windows', async () => {
    const res = await POST(req({
      name: 'closing',
      venueId: 'v1',
      taskIds: ['t1'],
      schedules: [{ dayOfWeek: 4, fromTime: '17:00', toTime: '22:00' }],
    }))

    expect(res.status).toBe(201)
    expect(prisma.checklist.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'CLOSING',
          schedules: { create: [{ dayOfWeek: 4, fromTime: '17:00', toTime: '22:00' }] },
        }),
      }),
    )
  })

  it('rejects an invalid day-of-week', async () => {
    const res = await POST(req({
      name: 'CLOSING',
      venueId: 'v1',
      taskIds: ['t1'],
      schedules: [{ dayOfWeek: 7, fromTime: '17:00' }],
    }))

    expect(res.status).toBe(400)
    expect(prisma.checklist.create).not.toHaveBeenCalled()
  })

  it('rejects an invalid time', async () => {
    const res = await POST(req({
      name: 'CLOSING',
      venueId: 'v1',
      taskIds: ['t1'],
      schedules: [{ dayOfWeek: 1, fromTime: '5pm' }],
    }))

    expect(res.status).toBe(400)
    expect(prisma.checklist.create).not.toHaveBeenCalled()
  })

  it('locks a manager to their own venue', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'vm' } })

    await POST(req({ name: 'CLOSING', venueId: 'other', taskIds: ['t1'] }))

    expect(prisma.checklist.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ venueId: 'vm' }) }),
    )
  })

  it('returns schedules on the list', async () => {
    prisma.checklist.findMany.mockResolvedValue([{
      id: 'c1', name: 'CLOSING', description: null, venueId: 'v1',
      departmentId: null, sectionId: null, appearFromTime: null, activatedOn: null,
      allowedOutcomes: [], requireOutcomeReason: false, department: null, section: null,
      audiences: [], schedules: [{ dayOfWeek: 4, fromTime: '17:00', toTime: null }],
      events: [], tasks: [],
    }])

    const res = await GET(getRequest('http://localhost/api/admin/checklists?venueId=v1'))
    const body = await res.json()

    expect(body[0].schedules).toEqual([{ dayOfWeek: 4, fromTime: '17:00', toTime: null }])
    expect(body[0].events).toEqual([])
  })
})

describe('/api/admin/checklists multi-day', () => {
  it('persists the multiDay flag on create', async () => {
    const res = await POST(req({ name: 'SIDE WORK', venueId: 'v1', taskIds: ['t1'], multiDay: true }))

    expect(res.status).toBe(201)
    expect(prisma.checklist.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ multiDay: true }) }),
    )
  })

  it('returns the multiDay flag on the list', async () => {
    prisma.checklist.findMany.mockResolvedValue([{
      id: 'c1', name: 'SIDE WORK', description: null, venueId: 'v1',
      departmentId: null, sectionId: null, appearFromTime: null, activatedOn: null,
      allowedOutcomes: [], requireOutcomeReason: false, multiDay: true,
      department: null, section: null, audiences: [], schedules: [], events: [], tasks: [],
    }])

    const res = await GET(getRequest('http://localhost/api/admin/checklists?venueId=v1'))
    const body = await res.json()

    expect(body[0].multiDay).toBe(true)
  })
})

describe('/api/admin/checklists events', () => {
  it('creates the selected event links', async () => {
    prisma.calendarEvent.count.mockResolvedValue(2)

    const res = await POST(req({ name: 'DINNER', venueId: 'v1', taskIds: ['t1'], eventIds: ['e1', 'e2'] }))

    expect(res.status).toBe(201)
    expect(prisma.calendarEvent.count).toHaveBeenCalledWith({
      where: { id: { in: ['e1', 'e2'] }, venueId: 'v1', deletedAt: null },
    })
    expect(prisma.checklistEvent.upsert).toHaveBeenCalledTimes(2)
    expect(prisma.checklistEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { checklistId_calendarEventId: { checklistId: 'c1', calendarEventId: 'e1' } } }),
    )
  })

  it('rejects an event outside the venue', async () => {
    prisma.calendarEvent.count.mockResolvedValue(0)

    const res = await POST(req({ name: 'DINNER', venueId: 'v1', taskIds: ['t1'], eventIds: ['other'] }))

    expect(res.status).toBe(400)
    expect(prisma.checklist.create).not.toHaveBeenCalled()
  })

  it('rejects a malformed eventIds payload', async () => {
    const res = await POST(req({ name: 'DINNER', venueId: 'v1', taskIds: ['t1'], eventIds: [123] }))

    expect(res.status).toBe(400)
    expect(prisma.checklist.create).not.toHaveBeenCalled()
  })
})
