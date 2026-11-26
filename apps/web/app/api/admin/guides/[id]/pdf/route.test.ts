import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, pdfToBuffer } = vi.hoisted(() => ({
  prisma: { guide: { findUnique: vi.fn() }, imageAnnotation: { findMany: vi.fn() } },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  pdfToBuffer: vi.fn(() => Buffer.from('%PDF-1.4')),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/guide-links', () => ({ attachTargets: vi.fn((links: unknown[]) => links) }))
vi.mock('@/lib/guide-links.server', () => ({ buildTargetIndex: vi.fn(async () => new Map()) }))
vi.mock('@/lib/reference-table.server', () => ({ buildPdfTable: vi.fn(async () => []) }))
vi.mock('@/lib/gift-card-template', () => ({ mergePdfBuffers: vi.fn(async () => Buffer.from('%PDF-1.4')) }))
vi.mock('@/lib/guide-pdf', () => ({
  generateGuidePdf: vi.fn(() => ({})),
  guidePdfToBuffer: pdfToBuffer,
  guidePdfFilename: vi.fn(() => 'FOOD SAFETY.pdf'),
  loadGuideAttachmentBuffer: vi.fn(async () => null),
  loadImageDataUrl: vi.fn(async () => null),
}))

import { GET } from './route'

function call(url: string) {
  return GET(new NextRequest(url), { params: { id: 'g1' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  prisma.guide.findUnique.mockResolvedValue({
    id: 'g1',
    venueId: 'v1',
    title: 'FOOD SAFETY',
    description: null,
    category: null,
    guideType: 'SOP',
    bodyHtml: null,
    requiresSignOff: false,
    isTracked: true,
    deletedAt: null,
    pdfPath: null,
    tableColumns: null,
    tableRows: [],
    steps: [],
    venue: { name: 'DEMO VENUE' },
  })
  prisma.imageAnnotation.findMany.mockResolvedValue([])
})

describe('GET /api/admin/guides/[id]/pdf', () => {
  it('serves the guide PDF inline when ?inline=1', async () => {
    const res = await call('http://localhost/api/admin/guides/g1/pdf?inline=1')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')?.startsWith('inline;')).toBe(true)
  })

  it('defaults to an attachment download', async () => {
    const res = await call('http://localhost/api/admin/guides/g1/pdf')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')?.startsWith('attachment;')).toBe(true)
  })
})
