import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { db, getWorkerSession } = vi.hoisted(() => ({
  db: {
    staffAvailability: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  getWorkerSession: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma: db }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))

import { DELETE, PATCH } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 'st1', venueId: 'v1' })
  db.staffAvailability.findUnique.mockResolvedValue({
    id: 'row1',
    staffId: 'st1',
    venueId: 'v1',
    deletedAt: null,
    notes: null,
  })
  db.staffAvailability.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'row1',
    notes: null,
    ...data,
  }))
})

describe('PATCH /api/worker/availability/[id]', () => {
  it('writes only the note and ignores availability/status/lock keys', async () => {
    const res = await PATCH(
      req({
        notes: '  RUNNING LATE  ',
        type: 'UNAVAILABLE',
        status: 'APPROVED',
        timeOff: true,
        windows: [{ type: 'AVAILABLE', startTime: '09:00', endTime: '17:00' }],
        locked: true,
        lockedAt: '2026-10-20T01:00:00.000Z',
        lockedReason: 'HACK',
      }),
      { params: { id: 'row1' } },
    )

    expect(res.status).toBe(200)
    expect(db.staffAvailability.update).toHaveBeenCalledWith({
      where: { id: 'row1' },
      data: { notes: 'RUNNING LATE' },
    })
    expect(await res.json()).toMatchObject({ success: true, notes: 'RUNNING LATE' })
  })

  it('rejects a body that is not a note', async () => {
    const res = await PATCH(req({ type: 'UNAVAILABLE' }), { params: { id: 'row1' } })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/worker/availability/[id]', () => {
  it('refuses to let a worker clear a day', async () => {
    const res = await DELETE()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'CLEARING IS A MANAGER ACTION — EDIT THE DAY INSTEAD' })
    expect(db.staffAvailability.findUnique).not.toHaveBeenCalled()
    expect(db.staffAvailability.update).not.toHaveBeenCalled()
  })

  it('still requires a worker session', async () => {
    getWorkerSession.mockResolvedValueOnce(null)

    const res = await DELETE()

    expect(res.status).toBe(401)
  })
})
