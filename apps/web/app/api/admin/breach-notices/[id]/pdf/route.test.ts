import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, guardAccess, resolveScopedVenueId, prisma, build, pdfRow, filename } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  prisma: { breachNotice: { findFirst: vi.fn() } },
  build: vi.fn(),
  pdfRow: vi.fn((row: unknown) => row),
  filename: vi.fn(() => 'BREACH NOTICE - ABC123 - 2026-11-01.pdf'),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/breach-notice-pdf', () => ({ breachNoticePdfFilename: filename }))
vi.mock('@/lib/breach-notice-pdf.server', () => ({ breachNoticePdfRow: pdfRow, buildBreachNoticePdfBuffer: build }))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  prisma.breachNotice.findFirst.mockResolvedValue({
    id: 'n1',
    numberplate: 'ABC123',
    breachDate: new Date('2026-11-01T00:00:00Z'),
    venue: { name: 'DEMO' },
    submittedBy: { firstName: 'Alex', lastName: 'Smith' },
    reviewedBy: null,
  })
  build.mockResolvedValue(new ArrayBuffer(8))
})

describe('GET /api/admin/breach-notices/[id]/pdf', () => {
  it('serves an attachment by default', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/admin/breach-notices/n1/pdf?venueId=v1'),
      { params: { id: 'n1' } },
    )
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain('attachment;')
  })

  it('serves inline for the in-app viewer', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/admin/breach-notices/n1/pdf?inline=1&venueId=v1'),
      { params: { id: 'n1' } },
    )
    expect(res.headers.get('Content-Disposition')).toContain('inline;')
    expect(build).toHaveBeenCalled()
  })
})
