import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    department: { findMany: vi.fn() },
    section: { findMany: vi.fn() },
    position: { findMany: vi.fn() },
    staff: { findMany: vi.fn() },
    staffEvent: { findMany: vi.fn(), create: vi.fn() },
    staffEventInvite: { findMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { GET, POST } from './route'

const getReq = (url = 'http://localhost/api/admin/import/staff-events') => ({ nextUrl: new URL(url) } as unknown as NextRequest)
const postReq = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

function row(overrides: Record<string, unknown> = {}) {
  return {
    action: 'CREATE',
    values: {
      title: 'TEAM BRIEFING',
      date: '2026-11-12',
      startTime: '18:00',
      endTime: '20:00',
      allDay: false,
      location: 'FUNCTION ROOM',
      description: 'Monthly briefing.',
      attendanceRequired: true,
      allowMaybe: true,
      requireDeclineReason: false,
      audienceKind: 'DEPARTMENT',
      audienceName: 'KITCHEN',
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  prisma.department.findMany.mockResolvedValue([{ id: 'd1', name: 'KITCHEN' }])
  prisma.section.findMany.mockResolvedValue([])
  prisma.position.findMany.mockResolvedValue([])
  prisma.staff.findMany.mockResolvedValue([{ id: 'a', departmentId: 'd1', sections: [], positions: [] }])
  prisma.staffEvent.findMany.mockResolvedValue([{ id: 'e9', title: 'OLD BRIEFING', startsAt: new Date('2026-10-01T09:00:00Z') }])
  prisma.staffEvent.create.mockResolvedValue({
    id: 'e1', venueId: 'v1', title: 'TEAM BRIEFING', description: 'Monthly briefing.', location: 'FUNCTION ROOM',
    startsAt: new Date('2026-11-12T18:00:00Z'), endsAt: new Date('2026-11-12T20:00:00Z'),
    allDay: false, attendanceRequired: true, status: 'DRAFT',
  })
  prisma.staffEventInvite.findMany.mockResolvedValue([])
  prisma.staffEventInvite.updateMany.mockResolvedValue({ count: 0 })
  prisma.staffEventInvite.upsert.mockResolvedValue({})
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
})

describe('GET /api/admin/import/staff-events', () => {
  it('returns audience refs and existing events keyed by title and date', async () => {
    const res = await GET(getReq())
    const data = await res.json()
    expect(data.departments).toEqual([{ id: 'd1', name: 'KITCHEN' }])
    expect(data.events).toEqual([{ id: 'e9', name: 'OLD BRIEFING|2026-10-01' }])
  })

  it('locks a manager to their own venue', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'vm' } })
    await GET(getReq('http://localhost/api/admin/import/staff-events?venueId=other'))
    expect(prisma.department.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ venueId: 'vm' }) }))
  })
})

describe('POST /api/admin/import/staff-events', () => {
  it('creates a DRAFT event and resolves the audience by name', async () => {
    const res = await POST(postReq({ rows: [row()] }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.created).toBe(1)
    expect(prisma.staffEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        venueId: 'v1',
        title: 'TEAM BRIEFING',
        status: 'DRAFT',
        audiences: { create: [{ kind: 'DEPARTMENT', targetId: 'd1' }] },
      }),
    }))
    expect(prisma.staffEventInvite.upsert).not.toHaveBeenCalled()
    expect(data.warnings).toContain('IMPORTED STAFF EVENTS ARE DRAFT - PUBLISH THEM TO SEND THE NOTICE TO STAFF')
  })

  it('skips a row with no end time', async () => {
    const bad = row({ values: { ...row().values, endTime: '' } })
    const res = await POST(postReq({ rows: [bad] }))
    const data = await res.json()
    expect(data.created).toBe(0)
    expect(data.skipped).toBe(1)
    expect(prisma.staffEvent.create).not.toHaveBeenCalled()
  })

  it('creates a DRAFT with no invites and a loud warning when the audience is unknown', async () => {
    const unknown = row({ values: { ...row().values, audienceName: 'NOWHERE' } })
    const res = await POST(postReq({ rows: [unknown] }))
    const data = await res.json()
    expect(data.created).toBe(1)
    expect(prisma.staffEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ audiences: undefined }),
    }))
    expect(prisma.staffEventInvite.upsert).not.toHaveBeenCalled()
    expect(prisma.staffEventInvite.updateMany).not.toHaveBeenCalled()
    expect(data.warnings.some((w: string) => w.includes('NOBODY WILL BE INVITED'))).toBe(true)
  })

  it('rejects UPDATE rows because import only creates', async () => {
    const res = await POST(postReq({ rows: [row({ action: 'UPDATE', targetId: 'e9' })] }))
    const data = await res.json()
    expect(data.created).toBe(0)
    expect(data.skipped).toBe(1)
  })

  it('rejects an empty payload', async () => {
    const res = await POST(postReq({ rows: [] }))
    expect(res.status).toBe(400)
  })
})
