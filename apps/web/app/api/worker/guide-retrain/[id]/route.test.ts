import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getWorkerSession, workerMayAssignTraining, resolveRetrainRequest, prisma } = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  workerMayAssignTraining: vi.fn(),
  resolveRetrainRequest: vi.fn(),
  prisma: { guideRetrainRequest: { findFirst: vi.fn() } },
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/worker-guide-access', () => ({ workerMayAssignTraining }))
vi.mock('@/lib/guide-warnings.server', () => ({ resolveRetrainRequest }))
vi.mock('@hospo-ops/db', () => ({ prisma }))

import { PATCH } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)
const params = { params: { id: 'r1' } }

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', firstName: 'JANE', role: 'STAFF' })
  workerMayAssignTraining.mockResolvedValue(false)
  prisma.guideRetrainRequest.findFirst.mockResolvedValue({ staffId: 's1' })
  resolveRetrainRequest.mockResolvedValue({ ok: true, request: { id: 'r1', status: 'DONE' } })
})

describe('PATCH /api/worker/guide-retrain/[id]', () => {
  it('lets the target worker resolve their own request without the assign grant', async () => {
    const res = await PATCH(req({ action: 'RESOLVE' }), params)
    expect(res.status).toBe(200)
    expect(resolveRetrainRequest).toHaveBeenCalledWith({
      id: 'r1',
      venueId: 'v1',
      status: 'DONE',
      resolvedById: 's1',
      note: null,
    })
  })

  it('does not let a non-target floor worker resolve someone else', async () => {
    prisma.guideRetrainRequest.findFirst.mockResolvedValue({ staffId: 's2' })
    const res = await PATCH(req({ action: 'RESOLVE' }), params)
    expect(res.status).toBe(403)
    expect(resolveRetrainRequest).not.toHaveBeenCalled()
  })

  it('does not let the target worker DISMISS without the assign grant', async () => {
    const res = await PATCH(req({ action: 'DISMISS' }), params)
    expect(res.status).toBe(403)
    expect(resolveRetrainRequest).not.toHaveBeenCalled()
  })

  it('requires the assign grant for a non-target with a valid request', async () => {
    prisma.guideRetrainRequest.findFirst.mockResolvedValue({ staffId: 's2' })
    workerMayAssignTraining.mockResolvedValue(true)
    await PATCH(req({ action: 'DISMISS', note: 'ACK' }), params)
    expect(resolveRetrainRequest).toHaveBeenCalledWith({
      id: 'r1',
      venueId: 'v1',
      status: 'DISMISSED',
      resolvedById: 's1',
      note: 'ACK',
    })
  })

  it('rejects an unknown action', async () => {
    const res = await PATCH(req({ action: 'NOPE' }), params)
    expect(res.status).toBe(400)
  })

  it('404s when the request is not in the worker venue', async () => {
    prisma.guideRetrainRequest.findFirst.mockResolvedValue(null)
    const res = await PATCH(req({ action: 'RESOLVE' }), params)
    expect(res.status).toBe(404)
  })

  it('passes a 409 through', async () => {
    resolveRetrainRequest.mockResolvedValue({ ok: false, status: 409, error: 'REQUEST ALREADY CLOSED' })
    const res = await PATCH(req({ action: 'RESOLVE' }), params)
    expect(res.status).toBe(409)
  })
})
