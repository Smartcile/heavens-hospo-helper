import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getWorkerSession } = vi.hoisted(() => ({
  prisma: {
    staffEvent: { findFirst: vi.fn() },
    staffEventInvite: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  },
  getWorkerSession: vi.fn(),
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@hospo-ops/db', () => ({ prisma }))

import { POST } from './route'

const params = { params: { id: 'e1' } }
const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

const event = {
  id: 'e1', venueId: 'v1', status: 'PUBLISHED', allowMaybe: false, requireDeclineReason: true,
  startsAt: new Date('2026-11-12T18:00:00Z'), endsAt: new Date('2099-11-12T20:00:00Z'), responseDeadline: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1' })
  prisma.staffEvent.findFirst.mockResolvedValue(event)
  prisma.staffEventInvite.findUnique.mockResolvedValue({ id: 'i1', deletedAt: null })
  prisma.staffEventInvite.update.mockResolvedValue({})
  prisma.staffEventInvite.findMany.mockResolvedValue([{ response: 'ACCEPTED' }, { response: 'PENDING' }])
})

describe('POST /api/worker/staff-events/[id]/respond', () => {
  it('requires a worker session', async () => {
    getWorkerSession.mockResolvedValueOnce(null)
    const res = await POST(req({ response: 'ACCEPTED' }), params)
    expect(res.status).toBe(401)
  })

  it('rejects someone who is not invited or is in another venue', async () => {
    prisma.staffEventInvite.findUnique.mockResolvedValueOnce(null)
    let res = await POST(req({ response: 'ACCEPTED' }), params)
    expect(res.status).toBe(404)
    prisma.staffEvent.findFirst.mockResolvedValueOnce(null)
    res = await POST(req({ response: 'ACCEPTED' }), params)
    expect(res.status).toBe(404)
    expect(prisma.staffEventInvite.update).not.toHaveBeenCalled()
  })

  it('rejects Maybe when the event does not allow it', async () => {
    const res = await POST(req({ response: 'MAYBE' }), params)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'MAYBE IS NOT AN OPTION FOR THIS EVENT' })
    expect(prisma.staffEventInvite.update).not.toHaveBeenCalled()
  })

  it('requires a reason to decline when the event says so', async () => {
    const res = await POST(req({ response: 'DECLINED' }), params)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'A REASON IS REQUIRED TO DECLINE' })
    expect(prisma.staffEventInvite.update).not.toHaveBeenCalled()
  })

  it('saves an accept and returns the refreshed attendance counts', async () => {
    const res = await POST(req({ response: 'accepted' }), params)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(prisma.staffEventInvite.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { response: 'ACCEPTED', reason: null, respondedAt: expect.any(Date) },
    })
    expect(data.attendance).toMatchObject({ accepted: 1, pending: 1, total: 2, responded: 1 })
  })

  it('returns 409 once the response deadline has passed', async () => {
    prisma.staffEvent.findFirst.mockResolvedValueOnce({ ...event, endsAt: new Date('2020-01-01T00:00:00Z') })
    const res = await POST(req({ response: 'ACCEPTED' }), params)
    expect(res.status).toBe(409)
    expect(prisma.staffEventInvite.update).not.toHaveBeenCalled()
  })
})
