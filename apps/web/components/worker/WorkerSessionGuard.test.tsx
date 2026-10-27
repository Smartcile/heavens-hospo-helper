import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}))

import { WorkerSessionGuard } from '@/components/worker/WorkerSessionGuard'

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

type ApiOptions = {
  sessionStatus?: number
  timeoutMinutes?: number
  refreshStatus?: number
}

function mockApi({ sessionStatus = 200, timeoutMinutes = 5, refreshStatus = 200 }: ApiOptions = {}) {
  const fetchMock = vi.mocked(global.fetch)
  fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url === '/api/worker/session' && method === 'GET') {
      if (sessionStatus !== 200) return response({ error: 'Unauthorized' }, sessionStatus)
      return response({
        timeoutMinutes,
        expiresAt: Date.now() + timeoutMinutes * 60_000,
        refreshAfterMs: 60_000,
      })
    }
    if (url === '/api/worker/session/refresh' && method === 'POST') {
      if (refreshStatus !== 200) return response({ error: 'Unauthorized' }, refreshStatus)
      return response({
        refreshed: true,
        timeoutMinutes,
        expiresAt: Date.now() + timeoutMinutes * 60_000,
      })
    }
    if (url === '/api/worker/logout' && method === 'POST') {
      return response({ success: true })
    }
    return response({})
  })
  return fetchMock
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('WorkerSessionGuard', () => {
  beforeEach(() => {
    replace.mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    vi.spyOn(global, 'fetch').mockResolvedValue(response({}))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('signs out cleanly when the session endpoint is unauthorized', async () => {
    const fetchMock = mockApi({ sessionStatus: 401 })
    render(<WorkerSessionGuard />)
    await flush()

    expect(fetchMock).toHaveBeenCalledWith('/api/worker/session')
    expect(fetchMock).toHaveBeenCalledWith('/api/worker/logout', { method: 'POST' })
    expect(replace).toHaveBeenCalledWith('/w/login')
  })

  it('logs out and redirects when the idle timeout elapses', async () => {
    const fetchMock = mockApi({ timeoutMinutes: 5 })
    render(<WorkerSessionGuard />)
    await flush()

    await advance(5 * 60_000)

    expect(fetchMock).toHaveBeenCalledWith('/api/worker/logout', { method: 'POST' })
    expect(replace).toHaveBeenCalledWith('/w/login')
  })

  it('refreshes on activity at most once per refresh window', async () => {
    const fetchMock = mockApi({ timeoutMinutes: 15 })
    render(<WorkerSessionGuard />)
    await flush()

    fireEvent.click(document.body)
    await flush()
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url) === '/api/worker/session/refresh')
    ).toHaveLength(1)

    // A second tap inside the 5-minute refresh window is throttled.
    fireEvent.click(document.body)
    await flush()
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url) === '/api/worker/session/refresh')
    ).toHaveLength(1)

    // After the window, activity refreshes again.
    await advance(5 * 60_000)
    fireEvent.click(document.body)
    await flush()
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url) === '/api/worker/session/refresh')
    ).toHaveLength(2)
  })

  it('child frames report activity to the top window instead of refreshing', async () => {
    const originalParent = Object.getOwnPropertyDescriptor(window, 'parent')
    const postMessage = vi.fn()
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: { postMessage },
    })
    const fetchMock = mockApi({ timeoutMinutes: 15 })

    try {
      render(<WorkerSessionGuard />)
      await flush()

      fireEvent.click(document.body)
      await flush()

      expect(postMessage).toHaveBeenCalledWith({ type: 'worker-activity' }, '*')
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url) === '/api/worker/session')
      ).toHaveLength(0)
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url) === '/api/worker/session/refresh')
      ).toHaveLength(0)
    } finally {
      if (originalParent) Object.defineProperty(window, 'parent', originalParent)
      else delete (window as unknown as { parent?: unknown }).parent
    }
  })
})
