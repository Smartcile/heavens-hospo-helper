import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getWorkerSession, subscribe, unsubscribe, getTaskLiveHub } = vi.hoisted(() => {
  const unsubscribe = vi.fn()
  const subscribe = vi.fn(() => unsubscribe)
  return {
    getWorkerSession: vi.fn(),
    subscribe,
    unsubscribe,
    getTaskLiveHub: vi.fn(() => ({ subscribe })),
  }
})

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/task-live.server', () => ({ getTaskLiveHub }))

import { GET } from './route'

const SESSION = { staffId: 's1', venueId: 'v1', role: 'STAFF', expiresAt: Date.now() + 60_000 }

function request(signal: AbortSignal = new AbortController().signal) {
  return { signal } as never
}

describe('GET /api/worker/tasks/live', () => {
  beforeEach(() => {
    getWorkerSession.mockReset()
    subscribe.mockClear()
    unsubscribe.mockClear()
    getTaskLiveHub.mockClear()
  })

  it('returns 401 without a worker session', async () => {
    getWorkerSession.mockResolvedValue(null)

    const res = await GET(request())

    expect(res.status).toBe(401)
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('returns an unbuffered SSE response and subscribes the venue', async () => {
    getWorkerSession.mockResolvedValue(SESSION)

    const res = await GET(request())

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(res.headers.get('cache-control')).toContain('no-cache')
    expect(res.headers.get('cache-control')).toContain('no-transform')
    expect(res.headers.get('x-accel-buffering')).toBe('no')
    expect(res.headers.get('connection')).toBe('keep-alive')
    expect(subscribe).toHaveBeenCalledWith('v1', expect.any(Function))

    await res.body?.cancel()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('cleans up the subscription when the request aborts', async () => {
    getWorkerSession.mockResolvedValue(SESSION)
    const controller = new AbortController()

    await GET(request(controller.signal))
    controller.abort()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('stops heartbeats after cleanup', async () => {
    getWorkerSession.mockResolvedValue(SESSION)
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const res = await GET(request())
    await res.body?.cancel()

    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })
})
