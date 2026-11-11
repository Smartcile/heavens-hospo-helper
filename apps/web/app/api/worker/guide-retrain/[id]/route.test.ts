import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getWorkerSession, workerMayAssignTraining, resolveRetrainRequest } = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  workerMayAssignTraining: vi.fn(),
  resolveRetrainRequest: vi.fn(),
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-guide-access', () => ({ workerMayAssignTraining }))
vi.mock('@/lib/guide-warnings.server', () => ({ resolveRetrainRequest }))

import { PATCH } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)
const params = { params: { id: 'r1' } }

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', firstName: 'JANE', role: 'STAFF' })
  workerMayAssignTraining.mockResolvedValue(true)
  resolveRetrainRequest.mockResolvedValue({ ok: true, request: { id: 'r1', status: 'DONE' } })
})

describe('PATCH /api/worker/guide-retrain/[id]', () => {
  it('requires the assign grant', async () => {
    workerMayAssignTraining.mockResolvedValue(false)
    const res = await PATCH(req({ action: 'RESOLVE' }), params)
    expect(res.status).toBe(403)
  })

  it('rejects an unknown action', async () => {
    const res = await PATCH(req({ action: 'NOPE' }), params)
    expect(res.status).toBe(400)
  })

  it('resolves in the session venue', async () => {
    await PATCH(req({ action: 'DISMISS', note: 'ACK' }), params)
    expect(resolveRetrainRequest).toHaveBeenCalledWith({
      id: 'r1',
      venueId: 'v1',
      status: 'DISMISSED',
      resolvedById: 's1',
      note: 'ACK',
    })
  })

  it('passes a 409 through', async () => {
    resolveRetrainRequest.mockResolvedValue({ ok: false, status: 409, error: 'REQUEST ALREADY CLOSED' })
    const res = await PATCH(req({ action: 'RESOLVE' }), params)
    expect(res.status).toBe(409)
  })
})
