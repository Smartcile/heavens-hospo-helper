import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: { event: { findFirst: vi.fn() } },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/events.server', () => ({ buildBeoPdfData: vi.fn(async () => ({ eventName: 'WEDDING' })) }))
vi.mock('@/lib/beo-block-defs.server', () => ({ loadBlockLibrary: vi.fn(async () => ({})) }))
vi.mock('@/lib/beo-pdf', () => ({
  beoPdfFilename: vi.fn(() => 'BEO - WEDDING.pdf'),
  beoPdfToBuffer: vi.fn(() => Buffer.from('%PDF-1.4')),
  generateBeoPdf: vi.fn(() => ({})),
}))

import { GET } from './route'

function call(url: string) {
  return GET(new NextRequest(url), { params: { id: 'e1' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  prisma.event.findFirst.mockResolvedValue({ venueId: 'v1' })
})

describe('GET /api/admin/events/[id]/pdf', () => {
  it('serves the BEO PDF inline when ?inline=1', async () => {
    const res = await call('http://localhost/api/admin/events/e1/pdf?variant=FULL&inline=1')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')?.startsWith('inline;')).toBe(true)
  })

  it('defaults to an attachment download', async () => {
    const res = await call('http://localhost/api/admin/events/e1/pdf?variant=FULL')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')?.startsWith('attachment;')).toBe(true)
  })
})
