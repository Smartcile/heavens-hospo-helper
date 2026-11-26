import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getWorkerSession, workerBreachAccess, prisma, build, pdfRow, filename } = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  workerBreachAccess: vi.fn(),
  prisma: { breachNotice: { findFirst: vi.fn() } },
  build: vi.fn(),
  pdfRow: vi.fn((row: unknown) => row),
  filename: vi.fn(() => 'BREACH NOTICE - ABC123 - 01-11-2026.pdf'),
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-breach-access', () => ({ workerBreachAccess }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/breach-notice-pdf', () => ({ breachNoticePdfFilename: filename }))
vi.mock('@/lib/breach-notice-pdf.server', () => ({ breachNoticePdfRow: pdfRow, buildBreachNoticePdfBuffer: build }))

import { GET } from './route'

const baseRow = {
  id: 'n1',
  numberplate: 'ABC123',
  breachDate: new Date('2026-11-01T00:00:00Z'),
  venue: { name: 'DEMO' },
  submittedBy: { firstName: 'Alex', lastName: 'Smith' },
  reviewedBy: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'STAFF' })
  workerBreachAccess.mockResolvedValue({ allowed: true, venueWide: false, canReview: false, canSubmitClient: false })
  prisma.breachNotice.findFirst.mockResolvedValue(baseRow)
  build.mockResolvedValue(new ArrayBuffer(8))
})

describe('GET /api/worker/breach-notices/[id]/pdf', () => {
  it('requires a session and access', async () => {
    getWorkerSession.mockResolvedValue(null)
    expect((await GET(new NextRequest('http://localhost/api/worker/breach-notices/n1/pdf'), { params: { id: 'n1' } })).status).toBe(401)

    getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'STAFF' })
    workerBreachAccess.mockResolvedValue({ allowed: false, venueWide: false, canReview: false, canSubmitClient: false })
    expect((await GET(new NextRequest('http://localhost/api/worker/breach-notices/n1/pdf'), { params: { id: 'n1' } })).status).toBe(403)
  })

  it('404s a missing row and scopes staff to their own notices', async () => {
    prisma.breachNotice.findFirst.mockResolvedValue(null)
    expect((await GET(new NextRequest('http://localhost/api/worker/breach-notices/n1/pdf'), { params: { id: 'n1' } })).status).toBe(404)
    expect(prisma.breachNotice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ venueId: 'v1', submittedById: 's1' }) }),
    )
  })

  it('serves inline for the viewer and an attachment by default', async () => {
    const inline = await GET(
      new NextRequest('http://localhost/api/worker/breach-notices/n1/pdf?inline=1'),
      { params: { id: 'n1' } },
    )
    expect(inline.headers.get('Content-Disposition')).toContain('inline;')

    const attachment = await GET(
      new NextRequest('http://localhost/api/worker/breach-notices/n1/pdf'),
      { params: { id: 'n1' } },
    )
    expect(attachment.headers.get('Content-Disposition')).toContain('attachment;')
    expect(build).toHaveBeenCalled()
  })
})
