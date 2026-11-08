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
