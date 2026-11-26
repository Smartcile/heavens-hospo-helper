import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getWorkerSession, workerBreachAccess, reviewBreachNotice } = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  workerBreachAccess: vi.fn(),
  reviewBreachNotice: vi.fn(),
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-breach-access', () => ({ workerBreachAccess }))
vi.mock('@/lib/breach-notices.server', () => ({ reviewBreachNotice }))

import { POST } from './route'

function req(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/worker/breach-notices/n1/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 'm1', venueId: 'v1', role: 'MANAGER' })
  workerBreachAccess.mockResolvedValue({ allowed: true, venueWide: true, canReview: true, canSubmitClient: true })
  reviewBreachNotice.mockResolvedValue({ ok: true, notice: { id: 'n1', status: 'WAIVED' } })
})

describe('POST /api/worker/breach-notices/[id]/review', () => {
  it('requires a session and review capability', async () => {
    getWorkerSession.mockResolvedValue(null)
    expect((await POST(req({ action: 'WAIVE' }), { params: { id: 'n1' } })).status).toBe(401)

    getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'STAFF' })
    workerBreachAccess.mockResolvedValue({ allowed: true, venueWide: false, canReview: false, canSubmitClient: false })
    expect((await POST(req({ action: 'WAIVE' }), { params: { id: 'n1' } })).status).toBe(403)
  })

  it('delegates the decision with the session venue and reviewer', async () => {
    const res = await POST(req({ action: 'MARK PAID', note: 'venue paid' }), { params: { id: 'n1' } })
    expect(res.status).toBe(200)
    expect(reviewBreachNotice).toHaveBeenCalledWith({
      id: 'n1',
      venueId: 'v1',
      reviewedById: 'm1',
      action: 'MARK PAID',
      note: 'venue paid',
    })
  })

  it('passes a closed-notice 409 through', async () => {
    reviewBreachNotice.mockResolvedValue({ ok: false, status: 409, error: 'THIS NOTICE HAS ALREADY BEEN CLOSED' })
    const res = await POST(req({ action: 'WAIVE', note: 'x' }), { params: { id: 'n1' } })
    expect(res.status).toBe(409)
  })
})
