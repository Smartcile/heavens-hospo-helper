import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getWorkerSession } = vi.hoisted(() => ({ getWorkerSession: vi.fn() }))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))

import { POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 'st1', venueId: 'v1' })
})

describe('POST /api/worker/availability/clear', () => {
  it('refuses to let a worker clear a day', async () => {
    const res = await POST()

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'CLEARING IS A MANAGER ACTION — EDIT THE DAY INSTEAD' })
  })

  it('still requires a worker session', async () => {
    getWorkerSession.mockResolvedValueOnce(null)

    const res = await POST()

    expect(res.status).toBe(401)
  })
})
