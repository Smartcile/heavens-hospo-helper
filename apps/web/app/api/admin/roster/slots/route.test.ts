import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, resolveScopedVenueId } = vi.hoisted(() => ({
  prisma: {
    rosterSlot: { findMany: vi.fn(), create: vi.fn() },
    position: { findMany: vi.fn(), findFirst: vi.fn() },
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

const getReq = (url = 'http://localhost/api/admin/roster/slots') =>
  ({ nextUrl: new URL(url) } as unknown as NextRequest)
const postReq = (body: unknown) => ({ json: async () => body, nextUrl: new URL('http://localhost') } as unknown as NextRequest)

const slot = (overrides: Record<string, unknown> = {}) => ({
  id: 'slot1',
  venueId: 'v1',
  name: 'DUTY MANAGER',
  positionId: 'p1',
  startTime: '07:00',
  endTime: '16:00',
  breakMinutes: 30,
  headcount: 1,
  colour: null,
  tag: null,
  isActive: true,
  sortOrder: 0,
  deletedAt: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  prisma.rosterSlot.findMany.mockResolvedValue([slot()])
  prisma.rosterSlot.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({ id: 'new', ...args.data }))
  prisma.position.findMany.mockResolvedValue([{ id: 'p1', name: 'DUTY MANAGER', colour: '#111111' }])
  prisma.position.findFirst.mockResolvedValue({ id: 'p1' })
})

describe('GET /api/admin/roster/slots', () => {
  it('returns slots with position names', async () => {
    const res = await GET(getReq())
    const body = await res.json()
    expect(body.slots[0]).toMatchObject({ positionName: 'DUTY MANAGER', positionColour: '#111111' })
  })

  it('returns 401 without a session', async () => {
    getServerSession.mockResolvedValue(null)
    expect((await GET(getReq())).status).toBe(401)
  })
})

describe('POST /api/admin/roster/slots', () => {
  it('creates a slot with an ALL CAPS name', async () => {
    const res = await POST(postReq({
      venueId: 'v1', name: ' duty manager ', positionId: 'p1', startTime: '07:00', endTime: '16:00',
      breakMinutes: 30, headcount: 1,
    }))
    expect(res.status).toBe(201)
    expect(prisma.rosterSlot.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ venueId: 'v1', name: 'DUTY MANAGER', headcount: 1, breakMinutes: 30 }),
    }))
  })

  it('rejects invalid hours/headcount', async () => {
    const res = await POST(postReq({ venueId: 'v1', name: 'BAR', startTime: '7am', endTime: '16:00', headcount: 0 }))
    expect(res.status).toBe(400)
    expect(prisma.rosterSlot.create).not.toHaveBeenCalled()
  })

  it('rejects a position from another venue', async () => {
    prisma.position.findFirst.mockResolvedValue(null)
    const res = await POST(postReq({ venueId: 'v1', name: 'BAR', positionId: 'p9', startTime: '07:00', endTime: '16:00', headcount: 1 }))
    expect(res.status).toBe(400)
  })
})
