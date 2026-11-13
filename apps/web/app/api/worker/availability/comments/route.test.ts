import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { db, getWorkerSession, mirrorNotes } = vi.hoisted(() => ({
  db: {
    venue: { findUnique: vi.fn() },
    staff: { findMany: vi.fn() },
    availabilityComment: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
  getWorkerSession: vi.fn(),
  mirrorNotes: vi.fn(),
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/availability-comments.server', () => ({ mirrorAvailabilityCommentNotes: mirrorNotes }))
vi.mock('@hospo-ops/db', () => ({ prisma: db }))

import { DELETE, GET, POST } from './route'

const req = (body?: unknown, url = 'http://localhost/api/worker/availability/comments') => ({
  nextUrl: new URL(url),
  json: async () => body,
} as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 'st1', venueId: 'v1' })
  db.venue.findUnique.mockResolvedValue({ staffCanDeleteAvailabilityComments: false })
  db.staff.findMany.mockResolvedValue([{ id: 'st1', firstName: 'TAYLOR', lastName: 'REED' }])
})

describe('GET /api/worker/availability/comments', () => {
  it('requires a worker session', async () => {
    getWorkerSession.mockResolvedValueOnce(null)
    expect((await GET(req(undefined, 'http://localhost/api/worker/availability/comments?date=2026-11-12'))).status).toBe(401)
  })

  it('rejects an impossible date', async () => {
    expect((await GET(req(undefined, 'http://localhost/api/worker/availability/comments?date=2026-99-99'))).status).toBe(400)
  })

  it("returns only the session person's own day, newest first", async () => {
    db.availabilityComment.findMany.mockResolvedValue([
      { id: 'c1', body: 'MINE', source: 'WORKER_APP', authorId: 'st1', createdAt: new Date('2026-11-12T02:00:00Z') },
    ])

    const res = await GET(req(undefined, 'http://localhost/api/worker/availability/comments?date=2026-11-12'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(db.availabilityComment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ venueId: 'v1', staffId: 'st1', deletedAt: null }),
    }))
    expect(body.comments).toEqual([
      expect.objectContaining({ id: 'c1', authorName: 'TAYLOR REED', canDelete: false }),
    ])
  })

  it('allows deleting own comments only when the venue toggle is on', async () => {
    db.venue.findUnique.mockResolvedValue({ staffCanDeleteAvailabilityComments: true })
    db.availabilityComment.findMany.mockResolvedValue([
      { id: 'c1', body: 'MINE', source: 'WORKER_APP', authorId: 'st1', createdAt: new Date('2026-11-12T02:00:00Z') },
      { id: 'c2', body: 'MANAGER', source: 'MANAGER', authorId: 'm1', createdAt: new Date('2026-11-12T01:00:00Z') },
    ])

    const res = await GET(req(undefined, 'http://localhost/api/worker/availability/comments?date=2026-11-12'))
    const body = await res.json()

    expect(body.canDelete).toBe(true)
    expect(body.comments[0].canDelete).toBe(true)
    expect(body.comments[1].canDelete).toBe(false)
  })
})

describe('POST /api/worker/availability/comments', () => {
  it('stamps WORKER_APP and the session person as author', async () => {
    db.availabilityComment.create.mockResolvedValue({
      id: 'c1', body: 'VIA TXT', source: 'WORKER_APP', authorId: 'st1', createdAt: new Date('2026-11-12T02:00:00Z'),
    })

    const res = await POST(req({ date: '2026-11-12', body: '  VIA TXT  ' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.comment).toMatchObject({ id: 'c1', source: 'WORKER_APP' })
    expect(db.availabilityComment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        venueId: 'v1',
        staffId: 'st1',
        body: 'VIA TXT',
        source: 'WORKER_APP',
        authorId: 'st1',
      }),
    })
    expect(mirrorNotes).toHaveBeenCalledWith('st1', '2026-11-12')
  })

  it('ignores any staffId sent by the client', async () => {
    db.availabilityComment.create.mockResolvedValue({
      id: 'c1', body: 'HI', source: 'WORKER_APP', authorId: 'st1', createdAt: new Date(),
    })
    await POST(req({ date: '2026-11-12', body: 'HI', staffId: 'someone-else' }))
    expect(db.availabilityComment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ staffId: 'st1', authorId: 'st1' }),
    })
  })
})

describe('DELETE /api/worker/availability/comments', () => {
  it('is a manager action by default (403)', async () => {
    const res = await DELETE(req({ id: 'c1' }))
    expect(res.status).toBe(403)
    expect(db.availabilityComment.update).not.toHaveBeenCalled()
  })

  it('refuses deleting another author even when the toggle is on', async () => {
    db.venue.findUnique.mockResolvedValue({ staffCanDeleteAvailabilityComments: true })
    db.availabilityComment.findFirst.mockResolvedValue({
      id: 'c2', staffId: 'st1', authorId: 'm1', date: new Date('2026-11-12T00:00:00Z'),
    })

    const res = await DELETE(req({ id: 'c2' }))
    expect(res.status).toBe(403)
    expect(db.availabilityComment.update).not.toHaveBeenCalled()
  })

  it('soft-deletes the worker own comment when allowed', async () => {
    db.venue.findUnique.mockResolvedValue({ staffCanDeleteAvailabilityComments: true })
    db.availabilityComment.findFirst.mockResolvedValue({
      id: 'c1', staffId: 'st1', authorId: 'st1', date: new Date('2026-11-12T00:00:00Z'),
    })
    db.availabilityComment.update.mockResolvedValue({ id: 'c1' })

    const res = await DELETE(req({ id: 'c1' }))
    expect(res.status).toBe(200)
    expect(db.availabilityComment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { deletedAt: expect.any(Date) },
    })
    expect(mirrorNotes).toHaveBeenCalledWith('st1', '2026-11-12')
  })
})
