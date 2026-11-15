'use client'

import { useEffect, useRef } from 'react'

/**
 * Should a live view poll right now? Only while enabled AND the tab is visible —
 * a hidden tab must never burn requests, and an in-progress editor must never be
 * replaced mid-edit.
 */
export function shouldPoll(visibility: DocumentVisibilityState | string | undefined, enabled: boolean): boolean {
  return enabled && visibility === 'visible'
}

export interface LiveRefreshOptions {
  /** Default 30 s — matches the kitchen dockets view. */
  intervalMs?: number
  enabled?: boolean
  /**
   * Optional SSE endpoint. When set, changes are pushed within a few seconds and
   * the interval stays as the unconditional fallback.
   */
  streamUrl?: string
  /** Collapse a burst of stream messages into one refresh. Default 300 ms. */
  debounceMs?: number
  /** Close the stream after this many consecutive errors. Default 3. */
  maxStreamErrors?: number
}

/**
 * Refresh on a visibility-gated interval, and immediately when the tab becomes
 * visible or the window regains focus. The latest `refresh` is always used, so
 * callers do not need to memoise it. Everything is torn down on unmount or when
 * `enabled` turns false.
 *
 * When `streamUrl` is supplied an `EventSource` is opened in parallel. A message
 * debounces into one `refresh`; after repeated errors the stream closes and the
 * 30 s interval carries on as before.
 */
export function useLiveRefresh(
  refresh: () => void | Promise<void>,
  {
    intervalMs = 30_000,
    enabled = true,
    streamUrl,
    debounceMs = 300,
    maxStreamErrors = 3,
  }: LiveRefreshOptions = {},
): void {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  // ── 30 s fallback poll (always active) ────────────────────────────────
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const canPoll = () => shouldPoll(document.visibilityState, enabled)
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer)
        timer = null
      }
    }
    const start = () => {
      if (timer !== null || !canPoll()) return
      timer = setInterval(() => {
        if (canPoll()) void refreshRef.current()
      }, intervalMs)
    }
    const refreshNow = () => {
      if (canPoll()) void refreshRef.current()
    }

    const onVisibility = () => {
      if (canPoll()) {
        refreshNow()
        start()
      } else {
        stop()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', refreshNow)
    start()

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', refreshNow)
    }
  }, [enabled, intervalMs])

  // ── Optional SSE stream ───────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !streamUrl || typeof EventSource === 'undefined') return

    const source = new EventSource(streamUrl)
    let errors = 0
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const clearDebounce = () => {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
    }

    source.onopen = () => {
      // A successful (re)connect resets the failure budget.
      errors = 0
    }

    // The server sends a NAMED event (`event: change`). `onmessage` only fires
    // for unnamed/default `message` events, so a named listener is required.
    const onChange = () => {
      clearDebounce()
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        void refreshRef.current()
      }, debounceMs)
    }
    source.addEventListener('change', onChange)

    source.onerror = () => {
      errors += 1
      if (errors >= maxStreamErrors) {
        clearDebounce()
        source.close()
      }
    }

    return () => {
      clearDebounce()
      source.removeEventListener('change', onChange)
      source.close()
    }
  }, [enabled, streamUrl, debounceMs, maxStreamErrors])
}
