import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, snapshot } = vi.hoisted(() => ({
  prisma: {
    updateConfirmation: { findMany: vi.fn() },
  },
  getServerSession: vi.fn(),
  snapshot: {
    version: '1005',
    generatedAt: '2026-11-05T00:00:00.000Z',
    repo: 'o/r',
    issues: [
      { number: 1, title: '[UI] OPEN', state: 'OPEN', url: 'u1', closedAt: null, labels: [] },
      { number: 2, title: '[UI] DONE', state: 'CLOSED', url: 'u2', closedAt: '2026-01-01', labels: [] },
    ],
  },
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/release-updates.server', () => ({ releaseSnapshot: snapshot }))

import { GET } from './route'

const req = (url = 'https://app.test/api/admin/updates') =>
  new NextRequest(url)

const SESSION = { user: { id: 'a1', role: 'ADMIN', venueId: 'v1' } }

describe('GET /api/admin/updates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerSession.mockResolvedValue(SESSION)
    prisma.updateConfirmation.findMany.mockResolvedValue([
      { issueNumber: 2, confirmedAt: '2026-11-05T01:00:00.000Z', note: null },
    ])
  })

  it('returns 401 without a session', async () => {
    getServerSession.mockResolvedValueOnce(null)
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('returns 403 for a manager', async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 'm1', role: 'MANAGER' } })
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect(prisma.updateConfirmation.findMany).not.toHaveBeenCalled()
  })

  it('returns the snapshot with only this admin’s confirmations', async () => {
    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.version).toBe('1005')
    expect(body.issues).toHaveLength(2)
    expect(body.confirmations).toEqual([
      { issueNumber: 2, confirmedAt: '2026-11-05T01:00:00.000Z', note: null },
    ])
    expect(body.progress).toEqual({ total: 1, confirmed: 1, percent: 100 })
    expect(prisma.updateConfirmation.findMany).toHaveBeenCalledWith({
      where: { staffId: 'a1', version: '1005', deletedAt: null },
      select: { issueNumber: true, confirmedAt: true, note: true },
      orderBy: { issueNumber: 'asc' },
    })
  })

  it('rejects a stale version', async () => {
    const res = await GET(req('https://app.test/api/admin/updates?version=1004'))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'VERSION MISMATCH', version: '1005' })
  })
})
