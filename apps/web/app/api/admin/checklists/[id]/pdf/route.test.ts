import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, pdfToBuffer } = vi.hoisted(() => ({
  prisma: { checklist: { findFirst: vi.fn() } },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  pdfToBuffer: vi.fn(() => Buffer.from('%PDF-1.4')),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/checklist-pdf', () => ({
  generateChecklistPdf: vi.fn(() => ({})),
  checklistPdfToBuffer: pdfToBuffer,
}))

import { GET } from './route'

function call(url: string) {
  return GET(new NextRequest(url), { params: { id: 'c1' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  prisma.checklist.findFirst.mockResolvedValue({
    id: 'c1',
    venueId: 'v1',
    name: 'OPENING',
    description: null,
    appearFromTime: null,
    venue: { name: 'DEMO VENUE' },
    tasks: [],
  })
})

describe('GET /api/admin/checklists/[id]/pdf', () => {
  it('serves the PDF inline when ?inline=1', async () => {
    const res = await call('http://localhost/api/admin/checklists/c1/pdf?inline=1')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')?.startsWith('inline;')).toBe(true)
  })

  it('defaults to an attachment download', async () => {
    const res = await call('http://localhost/api/admin/checklists/c1/pdf')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')?.startsWith('attachment;')).toBe(true)
  })
})
