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
}

/**
 * Refresh on a visibility-gated interval, and immediately when the tab becomes
 * visible or the window regains focus. The latest `refresh` is always used, so
 * callers do not need to memoise it. Everything is torn down on unmount or when
 * `enabled` turns false.
 */
export function useLiveRefresh(
  refresh: () => void | Promise<void>,
  { intervalMs = 30_000, enabled = true }: LiveRefreshOptions = {},
): void {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

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
}
