import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getWorkerSession } = vi.hoisted(() => ({ getWorkerSession: vi.fn() }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))

import { GET } from './route'

beforeEach(() => vi.clearAllMocks())

describe('GET /api/worker/tips/access', () => {
  it('allows managers and admins', async () => {
    getWorkerSession.mockResolvedValue({ role: 'MANAGER' })
    expect(await (await GET()).json()).toEqual({ allowed: true })
    getWorkerSession.mockResolvedValue({ role: 'ADMIN' })
    expect(await (await GET()).json()).toEqual({ allowed: true })
  })

  it('denies floor staff and signed-out sessions', async () => {
    getWorkerSession.mockResolvedValue({ role: 'STAFF' })
    expect(await (await GET()).json()).toEqual({ allowed: false })
    getWorkerSession.mockResolvedValue(null)
    expect(await (await GET()).json()).toEqual({ allowed: false })
  })
})
