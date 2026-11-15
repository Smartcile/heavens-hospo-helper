// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { shouldPoll, useLiveRefresh } from './use-live-refresh'

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value })
}

describe('shouldPoll', () => {
  it('polls only when enabled and the tab is visible', () => {
    expect(shouldPoll('visible', true)).toBe(true)
    expect(shouldPoll('hidden', true)).toBe(false)
    expect(shouldPoll('visible', false)).toBe(false)
    expect(shouldPoll('hidden', false)).toBe(false)
  })

  it('treats an unknown visibility as not pollable', () => {
    expect(shouldPoll(undefined, true)).toBe(false)
  })
})

describe('useLiveRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('refreshes on the interval while visible', () => {
    const refresh = vi.fn()
    renderHook(() => useLiveRefresh(refresh, { intervalMs: 1000 }))

    act(() => { vi.advanceTimersByTime(3000) })

    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('does not poll while hidden and resumes when visible', () => {
    const refresh = vi.fn()
    renderHook(() => useLiveRefresh(refresh, { intervalMs: 1000 }))

    setVisibility('hidden')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    // Becoming visible refreshes immediately, then the interval resumes.
    expect(refresh).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('refreshes on window focus when visible', () => {
    const refresh = vi.fn()
    renderHook(() => useLiveRefresh(refresh, { intervalMs: 1000 }))

    act(() => { window.dispatchEvent(new Event('focus')) })

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does no work when disabled', () => {
    const refresh = vi.fn()
    renderHook(() => useLiveRefresh(refresh, { intervalMs: 1000, enabled: false }))

    act(() => {
      vi.advanceTimersByTime(5000)
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(refresh).not.toHaveBeenCalled()
  })

  it('stops on unmount', () => {
    const refresh = vi.fn()
    const { unmount } = renderHook(() => useLiveRefresh(refresh, { intervalMs: 1000 }))

    unmount()
    act(() => { vi.advanceTimersByTime(5000) })

    expect(refresh).not.toHaveBeenCalled()
  })
})

class FakeEventSource {
  static instances: FakeEventSource[] = []
  static reset() {
    FakeEventSource.instances = []
  }

  url: string
  closed = false
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  // Named-event listener registry — mirrors the browser EventSource API that
  // the hook must use for `event: change`.
  listeners = new Map<string, Set<(event: MessageEvent) => void>>()

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(listener)
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.get(type)?.delete(listener)
  }

  close() {
    this.closed = true
  }

  emitOpen() {
    this.onopen?.()
  }

  emitMessage(data = 'revision') {
    this.onmessage?.(new MessageEvent('message', { data }))
  }

  emitChange(data = 'revision') {
    const event = new MessageEvent('change', { data })
    for (const listener of this.listeners.get('change') ?? []) listener(event)
  }

  emitError() {
    this.onerror?.()
  }
}

function installFakeEventSource() {
  ;(globalThis as unknown as { EventSource: unknown }).EventSource =
    FakeEventSource as unknown as typeof EventSource
}

function removeFakeEventSource() {
  delete (globalThis as unknown as { EventSource?: unknown }).EventSource
}

describe('useLiveRefresh stream', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
    FakeEventSource.reset()
    installFakeEventSource()
  })

  afterEach(() => {
    vi.useRealTimers()
    removeFakeEventSource()
  })

  it('opens the stream while enabled and closes it on unmount', () => {
    const { unmount } = renderHook(() =>
      useLiveRefresh(vi.fn(), { streamUrl: '/api/worker/tasks/live' }),
    )

    expect(FakeEventSource.instances).toHaveLength(1)
    expect(FakeEventSource.instances[0].url).toBe('/api/worker/tasks/live')

    unmount()
    expect(FakeEventSource.instances[0].closed).toBe(true)
  })

  it('does not open the stream when disabled', () => {
    renderHook(() => useLiveRefresh(vi.fn(), { enabled: false, streamUrl: '/api/live' }))

    expect(FakeEventSource.instances).toHaveLength(0)
  })

  it('closes the stream when enabled turns false', () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useLiveRefresh(vi.fn(), { enabled, streamUrl: '/api/live' }),
      { initialProps: { enabled: true } },
    )
    const source = FakeEventSource.instances[0]

    rerender({ enabled: false })

    expect(source.closed).toBe(true)
  })

  it('registers a named `change` listener (not onmessage)', () => {
    renderHook(() => useLiveRefresh(vi.fn(), { streamUrl: '/api/live' }))
    const source = FakeEventSource.instances[0]

    expect(source.listeners.get('change')?.size ?? 0).toBe(1)
  })

  it('debounces a burst of named change events into one refresh', () => {
    const refresh = vi.fn()
    renderHook(() => useLiveRefresh(refresh, { streamUrl: '/api/live', debounceMs: 300 }))
    const source = FakeEventSource.instances[0]

    act(() => {
      source.emitChange()
      source.emitChange()
      source.emitChange()
    })
    expect(refresh).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh on an unnamed `message` event (server sends `change`)', () => {
    const refresh = vi.fn()
    renderHook(() => useLiveRefresh(refresh, { streamUrl: '/api/live', debounceMs: 300 }))
    const source = FakeEventSource.instances[0]

    act(() => {
      source.emitMessage()
      vi.advanceTimersByTime(300)
    })

    expect(refresh).not.toHaveBeenCalled()
  })

  it('removes the change listener on unmount', () => {
    const { unmount } = renderHook(() => useLiveRefresh(vi.fn(), { streamUrl: '/api/live' }))
    const source = FakeEventSource.instances[0]

    unmount()

    expect(source.listeners.get('change')?.size ?? 0).toBe(0)
  })

  it('resets the error count on open', () => {
    renderHook(() => useLiveRefresh(vi.fn(), { streamUrl: '/api/live' }))
    const source = FakeEventSource.instances[0]

    act(() => {
      source.emitError()
      source.emitError()
      source.emitOpen()
      source.emitError()
      source.emitError()
    })

    expect(source.closed).toBe(false)
  })

  it('closes after repeated errors and falls back to the interval', () => {
    const refresh = vi.fn()
    renderHook(() =>
      useLiveRefresh(refresh, { intervalMs: 1000, streamUrl: '/api/live' }),
    )
    const source = FakeEventSource.instances[0]

    act(() => {
      source.emitError()
      source.emitError()
      source.emitError()
    })
    expect(source.closed).toBe(true)

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(refresh).toHaveBeenCalledTimes(3)
  })
})
