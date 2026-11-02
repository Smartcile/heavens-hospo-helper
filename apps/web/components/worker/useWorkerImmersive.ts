'use client'

import { useEffect } from 'react'

/**
 * Tell the worker dashboard shell that a full-screen view is open, so its
 * bottom "BACK TO DASHBOARD" bar can step out of the way. Worker pages are
 * rendered in an iframe by the dashboard; when opened directly this is a no-op.
 */
export function useWorkerImmersive(immersive: boolean) {
  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return
    window.parent.postMessage({ type: 'worker-immersive', immersive }, '*')
    return () => {
      window.parent.postMessage({ type: 'worker-immersive', immersive: false }, '*')
    }
  }, [immersive])
}
