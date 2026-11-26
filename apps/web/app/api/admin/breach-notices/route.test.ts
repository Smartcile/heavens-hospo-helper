import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, guardAccess, canAccess, resolveScopedVenueId, createBreachNotice, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  canAccess: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  createBreachNotice: vi.fn(),
  prisma: { breachNotice: { findMany: vi.fn() }, venue: { findUnique: vi.fn() } },
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess, canAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@/lib/breach-notices.server', () => ({ createBreachNotice }))
vi.mock('@hospo-ops/db', () => ({ prisma }))

import { GET, POST } from './route'

const req = new NextRequest('http://localhost/api/admin/breach-notices?venueId=v1')

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] } })
  guardAccess.mockResolvedValue(null)
  canAccess.mockResolvedValue(true)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  createBreachNotice.mockResolvedValue({ ok: true, notice: { id: 'n1' } })
  prisma.venue.findUnique.mockResolvedValue({ timezone: 'Pacific/Auckland' })
  prisma.breachNotice.findMany.mockResolvedValue([
    {
      id: 'n1',
      numberplate: 'ABC123',
      subjectType: 'STAFF',
      status: 'SUBMITTED',
      submittedBy: { firstName: 'Alex', lastName: 'Smith' },
      subjectStaff: { firstName: 'Alex', lastName: 'Smith' },
      reviewedBy: null,
    },
  ])
})

describe('GET /api/admin/breach-notices', () => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)
    expect((await GET(req)).status).toBe(401)
  })

  it('returns the guard denial', async () => {
    const { NextResponse } = await import('next/server')
    guardAccess.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await GET(req)).status).toBe(403)
  })

  it('locks a manager to the scoped venue and returns names', async () => {
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(prisma.breachNotice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ venueId: 'v1', deletedAt: null }) }),
    )
    const body = await res.json()
    expect(body.items[0].submittedByName).toBe('Alex Smith')
    expect(body.canReview).toBe(true)
  })

  it('rejects a venue the scoped resolver refuses', async () => {
    resolveScopedVenueId.mockReturnValue({ error: 'FORBIDDEN' })
    expect((await GET(req)).status).toBe(403)
  })
})

function postReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/breach-notices', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/breach-notices', () => {
  it('records a CLIENT notice with the acting venue and admin', async () => {
    const res = await POST(postReq({
      venueId: 'v1',
      subjectType: 'CLIENT',
      numberplate: 'abc123',
      noticeDetails: 'Ticket 998877',
      breachDate: '2026-11-01',
      attachmentUrls: ['/api/upload/photo.jpg'],
    }))
    expect(res.status).toBe(201)
    expect(createBreachNotice).toHaveBeenCalledWith({
      venueId: 'v1',
      submittedById: 'm1',
      input: expect.objectContaining({ subjectType: 'CLIENT' }),
      today: expect.any(String),
      allowClient: true,
    })
  })

  it('returns the guard denial and the creator failure', async () => {
    const { NextResponse } = await import('next/server')
    guardAccess.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await POST(postReq({}))).status).toBe(403)

    guardAccess.mockResolvedValue(null)
    createBreachNotice.mockResolvedValue({ ok: false, status: 400, error: 'BAD' })
    expect((await POST(postReq({}))).status).toBe(400)
  })
})
