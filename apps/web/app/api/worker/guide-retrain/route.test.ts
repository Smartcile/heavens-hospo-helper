import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getWorkerSession, workerMayAssignTraining, createRetrainRequests } = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  workerMayAssignTraining: vi.fn(),
  createRetrainRequests: vi.fn(),
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-guide-access', () => ({ workerMayAssignTraining }))
vi.mock('@/lib/guide-warnings.server', () => ({ createRetrainRequests }))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', firstName: 'JANE', role: 'STAFF' })
  workerMayAssignTraining.mockResolvedValue(true)
  createRetrainRequests.mockResolvedValue({
    ok: true,
    result: { created: [{ id: 'r1', guideId: 'g1' }], skipped: [] },
  })
})

describe('POST /api/worker/guide-retrain', () => {
  it('requires a worker session', async () => {
    getWorkerSession.mockResolvedValue(null)
    const res = await POST(req({ staffId: 's2', guideIds: ['g1'] }))
    expect(res.status).toBe(401)
  })

  it('requires the assign grant', async () => {
    workerMayAssignTraining.mockResolvedValue(false)
    const res = await POST(req({ staffId: 's2', guideIds: ['g1'] }))
    expect(res.status).toBe(403)
    expect(createRetrainRequests).not.toHaveBeenCalled()
  })

  it('writes only into the session venue', async () => {
    const res = await POST(req({ staffId: 's2', guideIds: ['g1'], reason: 'SEEN UNSAFE' }))
    expect(createRetrainRequests).toHaveBeenCalledWith({
      venueId: 'v1',
      staffId: 's2',
      guideIds: ['g1'],
      reason: 'SEEN UNSAFE',
      requestedById: 's1',
    })
    expect(res.status).toBe(201)
  })

  it('rejects a missing staff id', async () => {
    const res = await POST(req({ guideIds: ['g1'] }))
    expect(res.status).toBe(400)
  })
})
