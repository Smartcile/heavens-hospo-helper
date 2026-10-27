'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  resolveWorkerSessionMinutes,
  workerSessionRefreshIntervalMs,
} from '@/lib/worker-session-timeout'

const ACTIVITY_EVENTS = ['click', 'touchstart', 'keydown', 'pointerdown', 'scroll'] as const

/**
 * Single owner of the worker idle timer. Mounted once in the worker layout.
 *
 * The dashboard renders other worker pages in iframes. Only the top window
 * owns the timeout and the refresh/logout calls; child frames just report
 * activity to the top window so using a task/guide iframe counts as activity.
 */
export function WorkerSessionGuard() {
  const router = useRouter()
  const timeoutMsRef = useRef(resolveWorkerSessionMinutes(null) * 60_000)
  const lastActivityRef = useRef(Date.now())
  const lastRefreshRef = useRef(0)
  const lastChildPostRef = useRef(0)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshingRef = useRef(false)
  const endedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const isChild = window.parent !== window

    function clearIdleTimer() {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
        idleTimerRef.current = null
      }
    }

    async function endSession() {
      if (endedRef.current) return
      endedRef.current = true
      clearIdleTimer()
      try {
        // Worker-only logout: an explicit admin sign-out is the only thing
        // that should clear the NextAuth cookie.
        await fetch('/api/worker/logout', { method: 'POST' })
      } catch {
        // Best-effort — the redirect still leaves an expired page.
      }
      router.replace('/w/login')
    }

    function scheduleIdleTimer() {
      clearIdleTimer()
      idleTimerRef.current = setTimeout(() => {
        if (Date.now() - lastActivityRef.current >= timeoutMsRef.current) {
          void endSession()
        } else {
          scheduleIdleTimer()
        }
      }, timeoutMsRef.current)
    }

    async function refreshSession() {
      if (refreshingRef.current || endedRef.current) return
      const now = Date.now()
      const interval = workerSessionRefreshIntervalMs(timeoutMsRef.current / 60_000)
      if (now - lastRefreshRef.current < interval) return
      lastRefreshRef.current = now
      refreshingRef.current = true
      try {
        const res = await fetch('/api/worker/session/refresh', { method: 'POST' })
        if (res.status === 401) {
          await endSession()
          return
        }
        if (res.ok) {
          const data = await res.json().catch(() => null)
          if (data?.timeoutMinutes) {
            timeoutMsRef.current = resolveWorkerSessionMinutes(data.timeoutMinutes) * 60_000
          }
        }
      } catch {
        // Network hiccup — keep the current timer and retry on the next activity.
      } finally {
        refreshingRef.current = false
      }
    }

    function noteActivity() {
      if (endedRef.current) return
      lastActivityRef.current = Date.now()
      scheduleIdleTimer()
      void refreshSession()
    }

    function onActivity() {
      if (isChild) {
        const now = Date.now()
        if (now - lastChildPostRef.current < 1_000) return
        lastChildPostRef.current = now
        window.parent.postMessage({ type: 'worker-activity' }, '*')
        return
      }
      noteActivity()
    }

    function onMessage(e: MessageEvent) {
      if (isChild) return
      if (e.data?.type === 'worker-activity') noteActivity()
    }

    function onVisible() {
      if (isChild || document.visibilityState !== 'visible') return
      // Background tabs throttle timers; on return, decide from real elapsed
      // time instead of trusting the delayed setTimeout.
      if (Date.now() - lastActivityRef.current >= timeoutMsRef.current) {
        void endSession()
        return
      }
      noteActivity()
    }

    ACTIVITY_EVENTS.forEach((event) =>
      document.addEventListener(event, onActivity, { passive: true })
    )
    window.addEventListener('message', onMessage)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    if (!isChild) {
      scheduleIdleTimer()
      fetch('/api/worker/session')
        .then(async (res) => {
          if (res.status === 401) {
            await endSession()
            return null
          }
          return res.ok ? res.json() : null
        })
        .then((data) => {
          if (data?.timeoutMinutes) {
            timeoutMsRef.current = resolveWorkerSessionMinutes(data.timeoutMinutes) * 60_000
            scheduleIdleTimer()
          }
        })
        .catch(() => {
          // Keep the env fallback if the session endpoint is unreachable.
        })
    }

    return () => {
      clearIdleTimer()
      ACTIVITY_EVENTS.forEach((event) => document.removeEventListener(event, onActivity))
      window.removeEventListener('message', onMessage)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [router])

  return null
}
