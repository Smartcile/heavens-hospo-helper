import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { db, getServerSession, guardAccess, canAccess, getManagerVenueId, getAccessibleVenueIds, resolveScopedVenueId, mirrorNotes } = vi.hoisted(() => ({
  db: {
    staff: { findFirst: vi.fn(), findMany: vi.fn() },
    availabilityComment: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  canAccess: vi.fn(),
  getManagerVenueId: vi.fn(),
  getAccessibleVenueIds: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  mirrorNotes: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess, canAccess }))
vi.mock('@/lib/venue-scope', () => ({ getManagerVenueId, getAccessibleVenueIds, resolveScopedVenueId }))
vi.mock('@/lib/availability-comments.server', () => ({ mirrorAvailabilityCommentNotes: mirrorNotes }))
vi.mock('@hospo-ops/db', () => ({ prisma: db }))

import { DELETE, GET, POST } from './route'

const req = (body?: unknown, url = 'http://localhost/api/admin/availability/comments') => ({
  nextUrl: new URL(url),
  cookies: { get: () => undefined },
  json: async () => body,
} as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({
    user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  guardAccess.mockResolvedValue(null)
  canAccess.mockResolvedValue(true)
  getManagerVenueId.mockReturnValue('v1')
  getAccessibleVenueIds.mockReturnValue(['v1'])
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  db.staff.findFirst.mockResolvedValue({ id: 'st1' })
  db.staff.findMany.mockResolvedValue([{ id: 'm1', firstName: 'MORGAN', lastName: 'LEE' }])
})

describe('GET /api/admin/availability/comments', () => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValueOnce(null)
    expect((await GET(req(undefined, 'http://localhost/api/admin/availability/comments?staffId=st1&date=2026-11-12'))).status).toBe(401)
  })

  it('returns the thread newest-first with author names and manager delete', async () => {
    db.availabilityComment.findMany.mockResolvedValue([
      { id: 'c2', body: 'LATEST', source: 'MANAGER', authorId: 'm1', createdAt: new Date('2026-11-12T03:00:00Z') },
      { id: 'c1', body: 'OLDER', source: 'WORKER_APP', authorId: 'st1', createdAt: new Date('2026-11-12T01:00:00Z') },
    ])

    const res = await GET(req(undefined, 'http://localhost/api/admin/availability/comments?staffId=st1&date=2026-11-12'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.canDelete).toBe(true)
    expect(body.comments).toEqual([
      expect.objectContaining({ id: 'c2', authorName: 'MORGAN LEE', canDelete: true }),
      expect.objectContaining({ id: 'c1', canDelete: true }),
    ])
    expect(db.availabilityComment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ venueId: 'v1', staffId: 'st1', deletedAt: null }),
    }))
  })

  it('404s when the staff member is not in the venue', async () => {
    db.staff.findFirst.mockResolvedValueOnce(null)
    const res = await GET(req(undefined, 'http://localhost/api/admin/availability/comments?staffId=st2&date=2026-11-12'))
    expect(res.status).toBe(404)
  })

  it('rejects a bad or impossible date', async () => {
    expect((await GET(req(undefined, 'http://localhost/api/admin/availability/comments?staffId=st1&date=nope'))).status).toBe(400)
    expect((await GET(req(undefined, 'http://localhost/api/admin/availability/comments?staffId=st1&date=2026-99-99'))).status).toBe(400)
  })

  it('is read-only for a restricted manager without the edit grant', async () => {
    canAccess.mockResolvedValue(false)
    db.availabilityComment.findMany.mockResolvedValue([
      { id: 'c1', body: 'NOTE', source: 'WORKER_APP', authorId: 'st1', createdAt: new Date('2026-11-12T01:00:00Z') },
    ])

    const res = await GET(req(undefined, 'http://localhost/api/admin/availability/comments?staffId=st1&date=2026-11-12'))
    const body = await res.json()

    expect(body.canDelete).toBe(false)
    expect(body.canAdd).toBe(false)
    expect(body.comments[0].canDelete).toBe(false)
  })

  it('accepts an explicit venueId through the scoped resolver', async () => {
    resolveScopedVenueId.mockReturnValueOnce({ venueId: 'v2' })
    db.availabilityComment.findMany.mockResolvedValue([])

    const res = await GET(req(undefined, 'http://localhost/api/admin/availability/comments?staffId=st1&date=2026-11-12&venueId=v2'))

    expect(res.status).toBe(200)
    expect(resolveScopedVenueId).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'v2')
    expect(db.staff.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'st1', venueId: 'v2' }),
    }))
  })
})

describe('POST /api/admin/availability/comments', () => {
  it('stamps MANAGER as the source and mirrors the latest body onto notes', async () => {
    db.availabilityComment.create.mockResolvedValue({
      id: 'c1', body: 'CALLED THE VENUE', source: 'MANAGER', authorId: 'u1', createdAt: new Date('2026-11-12T04:00:00Z'),
    })

    const res = await POST(req({ staffId: 'st1', date: '2026-11-12', body: '  CALLED THE VENUE  ' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.comment).toMatchObject({ id: 'c1', source: 'MANAGER', canDelete: true })
    expect(db.availabilityComment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        venueId: 'v1',
        staffId: 'st1',
        body: 'CALLED THE VENUE',
        source: 'MANAGER',
        authorId: 'u1',
      }),
    })
    expect(mirrorNotes).toHaveBeenCalledWith('st1', '2026-11-12')
  })

  it('rejects an empty comment', async () => {
    const res = await POST(req({ staffId: 'st1', date: '2026-11-12', body: '   ' }))
    expect(res.status).toBe(400)
    expect(db.availabilityComment.create).not.toHaveBeenCalled()
  })

  it('rejects a comment over the cap', async () => {
    const res = await POST(req({ staffId: 'st1', date: '2026-11-12', body: 'x'.repeat(501) }))
    expect(res.status).toBe(400)
  })

  it('refuses a staff member outside the venue', async () => {
    db.staff.findFirst.mockResolvedValueOnce(null)
    const res = await POST(req({ staffId: 'st2', date: '2026-11-12', body: 'HI' }))
    expect(res.status).toBe(404)
  })

  it('posts to an explicit venueId through the scoped resolver', async () => {
    resolveScopedVenueId.mockReturnValueOnce({ venueId: 'v2' })
    db.availabilityComment.create.mockResolvedValue({
      id: 'c1', body: 'HI', source: 'MANAGER', authorId: 'u1', createdAt: new Date(),
    })

    const res = await POST(req({ staffId: 'st1', date: '2026-11-12', body: 'HI', venueId: 'v2' }))

    expect(res.status).toBe(200)
    expect(resolveScopedVenueId).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'v2')
    expect(db.availabilityComment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ venueId: 'v2' }),
    })
  })
})

describe('DELETE /api/admin/availability/comments', () => {
  it('soft-deletes a manager comment and re-mirrors notes', async () => {
    db.availabilityComment.findFirst.mockResolvedValue({ id: 'c1', staffId: 'st1', date: new Date('2026-11-12T00:00:00Z') })
    db.availabilityComment.update.mockResolvedValue({ id: 'c1' })

    const res = await DELETE(req({ id: 'c1' }))
    expect(res.status).toBe(200)
    expect(db.availabilityComment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { deletedAt: expect.any(Date) },
    })
    expect(mirrorNotes).toHaveBeenCalledWith('st1', '2026-11-12')
  })

  it('404s a comment outside the venue', async () => {
    db.availabilityComment.findFirst.mockResolvedValueOnce(null)
    const res = await DELETE(req({ id: 'nope' }))
    expect(res.status).toBe(404)
  })
})
