import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, resolveScopedVenueId, findMany, count } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@hospo-ops/db', () => ({
  prisma: {
    ftpClaim: { findMany, count },
    venue: { findUnique: vi.fn().mockResolvedValue({ timezone: 'Pacific/Auckland' }) },
  },
}))

import { GET } from './route'

function req(query = '') {
  return new NextRequest(`http://localhost/api/admin/parking/ftp/claims${query}`)
}

function claim(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    venueId: 'v1',
    typeId: 't1',
    typeName: 'RAYC',
    memberId: 'm1',
    membershipNumber: '12345',
    credentialKind: 'MEMBER',
    licensePlate: 'ABC123',
    contactName: 'TEST MEMBER',
    contactEmail: 'test@example.com',
    contactPhone: null,
    claimCode: '12345',
    status: 'CONFIRMED',
    message: 'PARKING CONFIRMED',
    httpStatus: 200,
    validFrom: '8:00 PM',
    validUntil: '12:00 AM',
    locations: ['The Landing Carpark'],
    confirmationText: 'Confirmed',
    evidencePdfPath: 'evidence/ftp/c1/evidence.pdf',
    evidenceImagePath: 'evidence/ftp/c1/confirmation.png',
    evidenceHtmlPath: 'evidence/ftp/c1/confirmation.html',
    durationMs: 5000,
    note: null,
    createdAt: new Date('2026-11-15T08:00:00Z'),
    updatedAt: new Date('2026-11-15T08:00:00Z'),
    deletedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { role: 'ADMIN' } })
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  findMany.mockResolvedValue([claim()])
  count.mockResolvedValue(1)
})

describe('GET /api/admin/parking/ftp/claims', () => {
  it('lists claims and applies filters', async () => {
    const res = await GET(req('?typeId=t1&status=CONFIRMED&plate=abc&limit=25&offset=10'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.total).toBe(1)
    expect(body.claims[0]).toMatchObject({
      id: 'c1',
      typeName: 'RAYC',
      licensePlate: 'ABC123',
      status: 'CONFIRMED',
    })
    const where = findMany.mock.calls[0][0].where
    expect(where).toMatchObject({
      venueId: 'v1',
      typeId: 't1',
      status: 'CONFIRMED',
      licensePlate: { contains: 'ABC', mode: 'insensitive' },
    })
    expect(findMany.mock.calls[0][0]).toMatchObject({ take: 25, skip: 10 })
  })

  it('clamps the limit and rejects missing auth', async () => {
    getServerSession.mockResolvedValue(null)
    expect((await GET(req())).status).toBe(401)
    getServerSession.mockResolvedValue({ user: { role: 'ADMIN' } })
    await GET(req('?limit=9999'))
    expect(findMany.mock.calls[0][0].take).toBe(500)
  })
})
