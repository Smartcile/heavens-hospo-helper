import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getWorkerSession, bulkNotRequiredGroup } = vi.hoisted(() => ({
  getWorkerSession: vi.fn(),
  bulkNotRequiredGroup: vi.fn(),
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/task-groups.server', () => ({ bulkNotRequiredGroup }))

import { POST } from './route'

const req = (body: unknown) =>
  ({
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  }) as unknown as NextRequest

describe('POST /api/worker/checklists/[id]/not-required', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWorkerSession.mockResolvedValue({ staffId: 'st1', venueId: 'v1', departmentId: 'd1' })
  })

  it('returns 401 without a worker session', async () => {
    getWorkerSession.mockResolvedValue(null)

    const res = await POST(req({ groupLabel: 'OUTSIDE' }), { params: { id: 'c1' } })

    expect(res.status).toBe(401)
    expect(bulkNotRequiredGroup).not.toHaveBeenCalled()
  })

  it('delegates the group, optional task ids and note', async () => {
    bulkNotRequiredGroup.mockResolvedValue({
      ok: true,
      completed: ['t1'],
      skipped: [{ taskId: 't2', reason: 'ALREADY SETTLED' }],
      requiresNote: false,
    })

    const res = await POST(
      req({ groupLabel: 'outside', taskIds: ['t1', 't2'], note: 'RAIN' }),
      { params: { id: 'c1' } },
    )

    expect(bulkNotRequiredGroup).toHaveBeenCalledWith({
      staffId: 'st1',
      venueId: 'v1',
      departmentId: 'd1',
      checklistId: 'c1',
      groupLabel: 'outside',
      taskIds: ['t1', 't2'],
      note: 'RAIN',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      completed: ['t1'],
      skipped: [{ taskId: 't2', reason: 'ALREADY SETTLED' }],
      requiresNote: false,
    })
  })

  it('defaults taskIds to null when omitted and passes the error status through', async () => {
    bulkNotRequiredGroup.mockResolvedValue({ ok: false, status: 422, error: 'A REASON IS REQUIRED' })

    const res = await POST(req({ groupLabel: 'OUTSIDE' }), { params: { id: 'c1' } })

    expect(bulkNotRequiredGroup).toHaveBeenCalledWith(expect.objectContaining({ taskIds: null }))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: 'A REASON IS REQUIRED' })
  })
})
