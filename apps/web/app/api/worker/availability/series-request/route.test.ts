import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { db, getWorkerSession, requestSeriesRemoval } = vi.hoisted(() => ({
  db: { venue: { findUnique: vi.fn() } },
  getWorkerSession: vi.fn(),
  requestSeriesRemoval: vi.fn(),
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@hospo-ops/db', () => ({ prisma: db }))
vi.mock('@/lib/availability.server', () => ({ requestSeriesRemoval }))

import { POST } from './route'

function req(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

const body = { date: '2026-10-15', seriesId: 's1' }

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 'st1', venueId: 'v1' })
  db.venue.findUnique.mockResolvedValue({ availabilityLockDays: 0, timezone: 'Pacific/Auckland' })
  requestSeriesRemoval.mockResolvedValue({ mode: 'REQUEST', requestId: 'r2', skipped: ['2026-10-22'] })
})

describe('POST /api/worker/availability/series-request', () => {
  it('requires a worker session', async () => {
    getWorkerSession.mockResolvedValueOnce(null)

    const res = await POST(req(body))
    expect(res.status).toBe(401)
    expect(requestSeriesRemoval).not.toHaveBeenCalled()
  })

  it('requires a valid date and a series', async () => {
    expect((await POST(req({ seriesId: 's1' }))).status).toBe(400)
    expect((await POST(req({ date: 'nope', seriesId: 's1' }))).status).toBe(400)
    expect((await POST(req({ date: '2026-10-15' }))).status).toBe(400)
    expect(requestSeriesRemoval).not.toHaveBeenCalled()
  })

  it('files the removal request for the session staff member', async () => {
    const res = await POST(req({ ...body, reason: 'MOVING' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ mode: 'REQUEST', requestId: 'r2', skipped: ['2026-10-22'] })
    expect(requestSeriesRemoval).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: 'st1', venueId: 'v1', dateKey: '2026-10-15', seriesId: 's1', reason: 'MOVING' }),
      expect.objectContaining({ bypass: false, allowedScopes: ['THIS', 'FROM'] }),
    )
  })

  it('passes a missing series through as a 404', async () => {
    requestSeriesRemoval.mockResolvedValueOnce({ error: 'SERIES NOT FOUND', status: 404 })

    const res = await POST(req(body))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'SERIES NOT FOUND' })
  })

  it('returns 409 for a duplicate pending removal', async () => {
    requestSeriesRemoval.mockResolvedValueOnce({ error: 'SERIES REMOVAL ALREADY REQUESTED', status: 409 })

    const res = await POST(req(body))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'SERIES REMOVAL ALREADY REQUESTED' })
  })
})
