import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { prisma, getServerSession, guardAccess, resolveScopedVenueId } = vi.hoisted(() => ({
  prisma: {
    rosterTemplate: { findMany: vi.fn(), create: vi.fn() },
    rosterTemplateShift: { createMany: vi.fn() },
    staff: { findMany: vi.fn() },
    position: { findMany: vi.fn() },
    shift: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  resolveScopedVenueId: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))

import { GET, POST } from './route'

const getReq = (url = 'http://localhost/api/admin/roster/templates') =>
  ({ nextUrl: new URL(url) } as unknown as NextRequest)
const postReq = (body: unknown) => ({ json: async () => body, nextUrl: new URL('http://localhost') } as unknown as NextRequest)

function templateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    venueId: 'v1',
    name: 'SUMMER WEEK',
    notes: null,
    createdAt: new Date('2026-11-09T00:00:00Z'),
    deletedAt: null,
    shifts: [
      {
        id: 'ts1', templateId: 't1', staffId: 's1', positionId: 'p1', dayIndex: 0,
        startTime: '09:00', endTime: '17:00', breakMinutes: 30, colour: null, tag: null, note: null, sortOrder: 0,
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  prisma.rosterTemplate.findMany.mockResolvedValue([templateRow()])
  prisma.staff.findMany.mockResolvedValue([{ id: 's1', firstName: 'JANE', lastName: 'SMITH' }])
  prisma.position.findMany.mockResolvedValue([{ id: 'p1', name: 'BARISTA', colour: '#111111' }])
  prisma.shift.findMany.mockResolvedValue([])
  prisma.rosterTemplate.create.mockResolvedValue({ id: 't2', name: 'WEEK 2' })
  prisma.rosterTemplateShift.createMany.mockResolvedValue({ count: 1 })
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
})

describe('GET /api/admin/roster/templates', () => {
  it('returns 401 without a session', async () => {
    getServerSession.mockResolvedValue(null)
    expect((await GET(getReq())).status).toBe(401)
  })

  it('returns the permission guard response unchanged', async () => {
    guardAccess.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await GET(getReq())).status).toBe(403)
  })

  it('lists templates with resolved staff and position names', async () => {
    const res = await GET(getReq())
    const body = await res.json()
    expect(body.templates[0].shifts[0]).toMatchObject({
      staffName: 'JANE SMITH',
      positionName: 'BARISTA',
      positionColour: '#111111',
    })
  })

  it('locks the venue to the scoped venue', async () => {
    await GET(getReq('http://localhost/api/admin/roster/templates?venueId=v2'))
    expect(resolveScopedVenueId).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'v2')
    expect(prisma.rosterTemplate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ venueId: 'v1' }) }))
  })
})

describe('POST /api/admin/roster/templates', () => {
  it('requires a name', async () => {
    const res = await POST(postReq({ venueId: 'v1', name: ' ', start: '2026-11-09' }))
    expect(res.status).toBe(400)
  })

  it('rejects a week with no shifts', async () => {
    const res = await POST(postReq({ venueId: 'v1', name: 'EMPTY', start: '2026-11-09' }))
    expect(res.status).toBe(422)
    expect(prisma.rosterTemplate.create).not.toHaveBeenCalled()
  })

  it('saves the week normalised to Monday–Sunday day indexes', async () => {
    prisma.shift.findMany.mockResolvedValue([
      { staffId: 's1', positionId: 'p1', date: new Date('2026-11-09T00:00:00Z'), startTime: '09:00', endTime: '17:00', breakMinutes: 30, colour: null, tag: null, note: null },
      { staffId: 's2', positionId: null, date: new Date('2026-11-15T00:00:00Z'), startTime: '10:00', endTime: '14:00', breakMinutes: 0, colour: null, tag: null, note: null },
    ])
    const res = await POST(postReq({ venueId: 'v1', name: ' summer week ', notes: ' busy ', start: '2026-11-11' }))
    expect(res.status).toBe(201)
    expect(prisma.rosterTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ venueId: 'v1', name: 'SUMMER WEEK', notes: 'busy' }),
    }))
    const rows = prisma.rosterTemplateShift.createMany.mock.calls[0][0].data
    expect(rows.map((r: { dayIndex: number }) => r.dayIndex)).toEqual([0, 6])
    expect(rows.every((r: { templateId: string }) => r.templateId === 't2')).toBe(true)
  })
})
