import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { db, getServerSession, guardAccess, getManagerVenueId } = vi.hoisted(() => ({
  db: {
    staffAvailability: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  getManagerVenueId: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ getManagerVenueId }))
vi.mock('@hospo-ops/db', () => ({ prisma: db }))

import { PATCH } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({
    user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  guardAccess.mockResolvedValue(null)
  getManagerVenueId.mockReturnValue('v1')
  db.staffAvailability.findUnique.mockResolvedValue({
    id: 'row1',
    venueId: 'v1',
    deletedAt: null,
    notes: null,
    lockedAt: null,
  })
  db.staffAvailability.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'row1',
    notes: null,
    lockedAt: null,
    ...data,
  }))
})

describe('PATCH /api/admin/availability/[id]', () => {
  it('changes only the note — availability, status and lock are untouched', async () => {
    db.staffAvailability.findUnique.mockResolvedValueOnce({
      id: 'row1',
      venueId: 'v1',
      deletedAt: null,
      notes: 'OLD',
      lockedAt: new Date('2026-10-20T01:00:00.000Z'),
    })
    db.staffAvailability.update.mockResolvedValueOnce({
      id: 'row1',
      notes: 'RANG THE VENUE',
      lockedAt: new Date('2026-10-20T01:00:00.000Z'),
    })

    const res = await PATCH(req({ notes: '  RANG THE VENUE  ' }), { params: { id: 'row1' } })

    expect(res.status).toBe(200)
    const call = db.staffAvailability.update.mock.calls[0][0]
    expect(call.data).toEqual({ notes: 'RANG THE VENUE' })
    expect(await res.json()).toMatchObject({ success: true, locked: true, notes: 'RANG THE VENUE' })
  })

  it('sets the lock fields without touching the note', async () => {
    const res = await PATCH(
      req({ locked: true, lockedReason: '  AGREED ON THE PHONE  ' }),
      { params: { id: 'row1' } },
    )

    expect(res.status).toBe(200)
    const data = db.staffAvailability.update.mock.calls[0][0].data
    expect(data.lockedAt).toBeInstanceOf(Date)
    expect(data.lockedById).toBe('u1')
    expect(data.lockedReason).toBe('AGREED ON THE PHONE')
    expect(data).not.toHaveProperty('notes')
  })

  it('rejects a body with nothing to update', async () => {
    const res = await PATCH(req({}), { params: { id: 'row1' } })

    expect(res.status).toBe(400)
    expect(db.staffAvailability.update).not.toHaveBeenCalled()
  })
})
