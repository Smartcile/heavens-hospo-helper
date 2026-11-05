import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, snapshot } = vi.hoisted(() => ({
  prisma: {
    updateConfirmation: { upsert: vi.fn(), updateMany: vi.fn() },
  },
  getServerSession: vi.fn(),
  snapshot: {
    version: '1005',
    generatedAt: '2026-11-05T00:00:00.000Z',
    repo: 'o/r',
    issues: [
      { number: 2, title: '[UI] DONE', state: 'CLOSED', url: 'u2', closedAt: '2026-01-01', labels: [] },
    ],
  },
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/release-updates.server', () => ({ releaseSnapshot: snapshot }))

import { PUT } from './route'

const req = (body: unknown = {}) =>
  ({
    json: async () => body,
  }) as unknown as NextRequest

const params = (issueNumber = '2') => ({ params: { issueNumber } })
const SESSION = { user: { id: 'a1', role: 'ADMIN', venueId: 'v1' } }

describe('PUT /api/admin/updates/[issueNumber]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerSession.mockResolvedValue(SESSION)
    prisma.updateConfirmation.upsert.mockResolvedValue({
      issueNumber: 2,
      confirmedAt: '2026-11-05T01:00:00.000Z',
      note: null,
    })
    prisma.updateConfirmation.updateMany.mockResolvedValue({ count: 1 })
  })

  it('returns 401 without a session', async () => {
    getServerSession.mockResolvedValueOnce(null)
    const res = await PUT(req({ confirmed: true }), params())
    expect(res.status).toBe(401)
  })

  it('returns 403 for a manager', async () => {
    getServerSession.mockResolvedValueOnce({ user: { id: 'm1', role: 'MANAGER' } })
    const res = await PUT(req({ confirmed: true }), params())
    expect(res.status).toBe(403)
    expect(prisma.updateConfirmation.upsert).not.toHaveBeenCalled()
  })

  it('rejects an unknown issue number', async () => {
    const res = await PUT(req({ confirmed: true }), params('999'))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'UNKNOWN ISSUE' })
    expect(prisma.updateConfirmation.upsert).not.toHaveBeenCalled()
  })

  it('rejects a stale version', async () => {
    const res = await PUT(req({ version: '1004', confirmed: true }), params())
    expect(res.status).toBe(409)
    expect(prisma.updateConfirmation.upsert).not.toHaveBeenCalled()
  })

  it('confirms by upserting and revives a soft-deleted row', async () => {
    const res = await PUT(req({ version: '1005', confirmed: true }), params())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.confirmed).toBe(true)
    expect(prisma.updateConfirmation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          version_issueNumber_staffId: { version: '1005', issueNumber: 2, staffId: 'a1' },
        },
        update: expect.objectContaining({ deletedAt: null }),
        create: expect.objectContaining({ version: '1005', issueNumber: 2, staffId: 'a1' }),
      }),
    )
  })

  it('unticking soft-deletes instead of hard-deleting', async () => {
    const res = await PUT(req({ confirmed: false }), params())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ confirmed: false })
    expect(prisma.updateConfirmation.updateMany).toHaveBeenCalledWith({
      where: { version: '1005', issueNumber: 2, staffId: 'a1', deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    })
    expect(prisma.updateConfirmation.upsert).not.toHaveBeenCalled()
  })
})
