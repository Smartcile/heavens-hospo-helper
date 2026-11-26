'use client'

import { useEffect } from 'react'

// Multiple components can ask for immersive mode at once (e.g. a worker page
// that is already full-screen opening the in-app PDF viewer). Reference-count
// the requests so closing one never reveals the dashboard's bottom bar while
// another full-screen view is still open.
let immersiveCount = 0

/**
 * Tell the worker dashboard shell that a full-screen view is open, so its
 * bottom "BACK TO DASHBOARD" bar can step out of the way. Worker pages are
 * rendered in an iframe by the dashboard; when opened directly this is a no-op.
 */
export function useWorkerImmersive(immersive: boolean) {
  useEffect(() => {
    if (!immersive) return
    if (typeof window === 'undefined' || window.parent === window) return

    immersiveCount += 1
    window.parent.postMessage({ type: 'worker-immersive', immersive: true }, '*')

    return () => {
      immersiveCount = Math.max(0, immersiveCount - 1)
      if (immersiveCount === 0) {
        window.parent.postMessage({ type: 'worker-immersive', immersive: false }, '*')
      }
    }
  }, [immersive])
}
