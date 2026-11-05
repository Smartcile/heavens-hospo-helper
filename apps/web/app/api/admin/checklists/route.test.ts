import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: { checklist: { findMany: vi.fn(), create: vi.fn() } },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

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
      audiences: [], schedules: [{ dayOfWeek: 4, fromTime: '17:00', toTime: null }], tasks: [],
    }])

    const res = await GET(getRequest('http://localhost/api/admin/checklists?venueId=v1'))
    const body = await res.json()

    expect(body[0].schedules).toEqual([{ dayOfWeek: 4, fromTime: '17:00', toTime: null }])
  })
})
