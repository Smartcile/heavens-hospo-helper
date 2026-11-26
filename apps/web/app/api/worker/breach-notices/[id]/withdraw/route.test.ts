import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getWorkerSession, workerBreachAccess, withdrawBreachNotice } = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  workerBreachAccess: vi.fn(),
  withdrawBreachNotice: vi.fn(),
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-breach-access', () => ({ workerBreachAccess }))
vi.mock('@/lib/breach-notices.server', () => ({ withdrawBreachNotice }))

import { POST } from './route'

const req = new NextRequest('http://localhost/api/worker/breach-notices/n1/withdraw', { method: 'POST' })

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'STAFF' })
  workerBreachAccess.mockResolvedValue({ allowed: true, venueWide: false, canReview: false, canSubmitClient: false })
  withdrawBreachNotice.mockResolvedValue({ ok: true, notice: { id: 'n1', status: 'WITHDRAWN' } })
})

describe('POST /api/worker/breach-notices/[id]/withdraw', () => {
  it('requires a session and access', async () => {
    getWorkerSession.mockResolvedValue(null)
    expect((await POST(req, { params: { id: 'n1' } })).status).toBe(401)

    getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'STAFF' })
    workerBreachAccess.mockResolvedValue({ allowed: false, venueWide: false, canReview: false, canSubmitClient: false })
    expect((await POST(req, { params: { id: 'n1' } })).status).toBe(403)
  })

  it('delegates with own-only permission for a worker', async () => {
    const res = await POST(req, { params: { id: 'n1' } })
    expect(res.status).toBe(200)
    expect(withdrawBreachNotice).toHaveBeenCalledWith({
      id: 'n1',
      venueId: 'v1',
      staffId: 's1',
      allowAny: false,
    })
  })

  it('allows a manager to withdraw any notice', async () => {
    getWorkerSession.mockResolvedValue({ staffId: 'm1', venueId: 'v1', role: 'MANAGER' })
    workerBreachAccess.mockResolvedValue({ allowed: true, venueWide: true, canReview: true, canSubmitClient: true })
    await POST(req, { params: { id: 'n1' } })
    expect(withdrawBreachNotice).toHaveBeenCalledWith(expect.objectContaining({ allowAny: true }))
  })
})
