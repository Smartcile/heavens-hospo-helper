import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getWorkerSession, workerBreachAccess, createBreachNotice, prisma } = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  workerBreachAccess: vi.fn(),
  createBreachNotice: vi.fn(),
  prisma: {
    venue: { findUnique: vi.fn() },
    breachNotice: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-breach-access', () => ({ workerBreachAccess }))
vi.mock('@/lib/breach-notices.server', () => ({ createBreachNotice }))
vi.mock('@hospo-ops/db', () => ({ prisma }))

import { GET, POST } from './route'

const ACCESS_MANAGER = { allowed: true, venueWide: true, canReview: true, canSubmitClient: true }
const ACCESS_STAFF = { allowed: true, venueWide: false, canReview: false, canSubmitClient: false }

function post(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/worker/breach-notices', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'STAFF' })
  workerBreachAccess.mockResolvedValue(ACCESS_STAFF)
  createBreachNotice.mockResolvedValue({ ok: true, notice: { id: 'n1' } })
  prisma.venue.findUnique.mockResolvedValue({ timezone: 'Pacific/Auckland' })
  prisma.breachNotice.findMany.mockResolvedValue([])
})

describe('GET /api/worker/breach-notices', () => {
  it('requires a session', async () => {
    getWorkerSession.mockResolvedValue(null)
    expect((await GET(new NextRequest('http://localhost/api/worker/breach-notices'))).status).toBe(401)
  })

  it('scopes a floor staff member to their own rows', async () => {
    await GET(new NextRequest('http://localhost/api/worker/breach-notices'))
    expect(prisma.breachNotice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ venueId: 'v1', submittedById: 's1' }) }),
    )
  })

  it('gives a manager the whole venue and applies filters', async () => {
    workerBreachAccess.mockResolvedValue(ACCESS_MANAGER)
    await GET(new NextRequest('http://localhost/api/worker/breach-notices?subjectType=client&status=submitted'))
    const where = prisma.breachNotice.findMany.mock.calls[0][0].where
    expect(where.submittedById).toBeUndefined()
    expect(where.subjectType).toBe('CLIENT')
    expect(where.status).toBe('SUBMITTED')
  })
})

describe('POST /api/worker/breach-notices', () => {
  it('passes the client capability through to the creator', async () => {
    workerBreachAccess.mockResolvedValue(ACCESS_MANAGER)
    const res = await POST(post({ subjectType: 'CLIENT', attachmentUrls: ['/api/upload/a.jpg'] }))
    expect(res.status).toBe(201)
    expect(createBreachNotice).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: 'v1', submittedById: 's1', allowClient: true }),
    )
  })

  it('returns the validation failure from the creator', async () => {
    createBreachNotice.mockResolvedValue({ ok: false, status: 400, error: 'ADD AT LEAST ONE PHOTO OF THE NOTICE' })
    const res = await POST(post({ subjectType: 'STAFF', attachmentUrls: [] }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('PHOTO')
  })

  it('rejects an unreadable body', async () => {
    const req = new NextRequest('http://localhost/api/worker/breach-notices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    })
    expect((await POST(req)).status).toBe(400)
  })
})
