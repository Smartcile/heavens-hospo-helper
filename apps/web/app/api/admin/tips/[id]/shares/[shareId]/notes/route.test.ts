import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const {
  db,
  getServerSession,
  guardAccess,
  canAccess,
  getManagerVenueId,
  getAccessibleVenueIds,
} = vi.hoisted(() => ({
  db: {
    tipsPeriod: { findFirst: vi.fn() },
    tipsShare: { findFirst: vi.fn() },
    tipsShareNote: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    staff: { findMany: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  canAccess: vi.fn(),
  getManagerVenueId: vi.fn(),
  getAccessibleVenueIds: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess, canAccess }))
vi.mock('@/lib/venue-scope', () => ({ getManagerVenueId, getAccessibleVenueIds }))
vi.mock('@hospo-ops/db', () => ({ prisma: db }))

import { DELETE, GET, POST } from './route'

const params = { params: { id: 'p1', shareId: 'r1' } }
const req = (body?: unknown, url = 'http://localhost/api/admin/tips/p1/shares/r1/notes') =>
  ({ nextUrl: new URL(url), cookies: { get: () => undefined }, json: async () => body } as unknown as NextRequest)

const note = (over: Record<string, unknown> = {}) => ({
  id: 'n1',
  body: 'CHECK THE TILL',
  source: 'MANAGER',
  authorId: 'u1',
  createdAt: new Date('2026-11-12T03:00:00.000Z'),
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({
    user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  guardAccess.mockResolvedValue(null)
  canAccess.mockResolvedValue(true)
  getManagerVenueId.mockReturnValue('v1')
  getAccessibleVenueIds.mockReturnValue(['v1'])
  db.tipsPeriod.findFirst.mockResolvedValue({ id: 'p1', venueId: 'v1' })
  db.tipsShare.findFirst.mockResolvedValue({ id: 'r1' })
  db.tipsShareNote.findMany.mockResolvedValue([note()])
  db.tipsShareNote.create.mockResolvedValue(note())
  db.tipsShareNote.update.mockResolvedValue({ id: 'n1' })
  db.tipsShareNote.findFirst.mockResolvedValue({ id: 'n1' })
  db.staff.findMany.mockResolvedValue([{ id: 'u1', firstName: 'MORGAN', lastName: 'LEE' }])
})

describe('GET /api/admin/tips/[id]/shares/[shareId]/notes', () => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValueOnce(null)
    expect((await GET(req(), params)).status).toBe(401)
  })

  it('requires the tips view grant', async () => {
    guardAccess.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await GET(req(), params)).status).toBe(403)
    expect(db.tipsShareNote.findMany).not.toHaveBeenCalled()
  })

  it('returns the thread newest-first with author names and the effective capability', async () => {
    const res = await GET(req(), params)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.canAdd).toBe(true)
    expect(body.canDelete).toBe(true)
    expect(body.notes[0]).toMatchObject({ id: 'n1', authorName: 'MORGAN LEE', canDelete: true })
    expect(db.tipsShareNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ venueId: 'v1', tipsPeriodId: 'p1', tipsShareId: 'r1', deletedAt: null }),
      }),
    )
  })

  it('is read-only for a restricted manager without the edit grant', async () => {
    canAccess.mockResolvedValue(false)
    const res = await GET(req(), params)
    const body = await res.json()
    expect(body.canAdd).toBe(false)
    expect(body.notes[0].canDelete).toBe(false)
  })

  it('locks a MANAGER to the period venue', async () => {
    getServerSession.mockResolvedValue({
      user: { id: 'u1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
    })
    getManagerVenueId.mockReturnValue('v1')
    db.tipsPeriod.findFirst.mockResolvedValueOnce({ id: 'p1', venueId: 'v2' })
    expect((await GET(req(), params)).status).toBe(403)
  })

  it('404s a share that is not on the period', async () => {
    db.tipsShare.findFirst.mockResolvedValueOnce(null)
    expect((await GET(req(), params)).status).toBe(404)
  })
})

describe('POST /api/admin/tips/[id]/shares/[shareId]/notes', () => {
  it('requires the tips edit grant', async () => {
    guardAccess.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await POST(req({ body: 'HI' }), params)).status).toBe(403)
    expect(db.tipsShareNote.create).not.toHaveBeenCalled()
  })

  it('rejects an empty note', async () => {
    const res = await POST(req({ body: '   ' }), params)
    expect(res.status).toBe(400)
    expect(db.tipsShareNote.create).not.toHaveBeenCalled()
  })

  it('rejects a note over the cap', async () => {
    const res = await POST(req({ body: 'x'.repeat(501) }), params)
    expect(res.status).toBe(400)
  })

  it('stamps MANAGER, the author and the venue re-derived from the period', async () => {
    const res = await POST(req({ body: '  CHECK THE TILL  ' }), params)
    expect(res.status).toBe(200)
    expect(db.tipsShareNote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        venueId: 'v1',
        tipsPeriodId: 'p1',
        tipsShareId: 'r1',
        body: 'CHECK THE TILL',
        source: 'MANAGER',
        authorId: 'u1',
      }),
    })
  })

  it('stays writable on a locked period (no payout changes)', async () => {
    // loadScoped deliberately never inspects the share status; a paid-out row
    // still accepts a note.
    db.tipsShare.findFirst.mockResolvedValueOnce({ id: 'r1', status: 'ISSUED' })
    expect((await POST(req({ body: 'PAID IN CASH' }), params)).status).toBe(200)
  })
})

describe('DELETE /api/admin/tips/[id]/shares/[shareId]/notes', () => {
  it('requires an id', async () => {
    expect((await DELETE(req({}), params)).status).toBe(400)
  })

  it('soft-deletes a note scoped to the share', async () => {
    const res = await DELETE(req({ id: 'n1' }), params)
    expect(res.status).toBe(200)
    expect(db.tipsShareNote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'n1', venueId: 'v1', tipsPeriodId: 'p1', tipsShareId: 'r1' }),
      }),
    )
    expect(db.tipsShareNote.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { deletedAt: expect.any(Date) },
    })
  })

  it('404s a note outside the share', async () => {
    db.tipsShareNote.findFirst.mockResolvedValueOnce(null)
    expect((await DELETE(req({ id: 'nope' }), params)).status).toBe(404)
  })
})
