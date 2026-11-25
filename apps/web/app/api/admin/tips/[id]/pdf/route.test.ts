import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, getManagerVenueId } = vi.hoisted(() => ({
  prisma: { tipsPeriod: { findFirst: vi.fn() } },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  getManagerVenueId: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ getManagerVenueId }))

import { GET } from './route'

const req = (url = 'http://localhost/api/admin/tips/p1/pdf') =>
  ({ nextUrl: new URL(url) } as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  getManagerVenueId.mockReturnValue(null)
  prisma.tipsPeriod.findFirst.mockResolvedValue({
    id: 'p1',
    venueId: 'v1',
    label: 'FEBRUARY "2026"',
    fromDate: new Date('2026-02-01T00:00:00.000Z'),
    toDate: new Date('2026-02-28T00:00:00.000Z'),
    cashCounts: {},
    posTotal: 0,
    notes: null,
    fullyIssuedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    venue: { name: 'Demo Venue' },
    shares: [],
  })
})

describe('GET /api/admin/tips/[id]/pdf', () => {
  it('sanitises the period label in Content-Disposition', async () => {
    const res = await GET(req(), { params: { id: 'p1' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Tips - FEBRUARY 2026.pdf"',
    )
  })

  it('uses inline when requested', async () => {
    const res = await GET(req('http://localhost/api/admin/tips/p1/pdf?inline=1'), {
      params: { id: 'p1' },
    })
    expect(res.headers.get('Content-Disposition')).toMatch(/^inline;/)
  })
})
