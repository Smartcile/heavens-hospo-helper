'use client'

// Preserve scroll position across a soft data refresh on live pages.
//
// The page keeps its previous payload mounted while a save re-fetches, so the
// only thing that can move is the scroll position when rows change height.
// `captureScroll` snapshots the window scroll + every `[data-scroll-key]`
// container; `restoreScroll` puts them back on the next animation frame. The
// guard skips the window scroll when the user has scrolled since the snapshot
// (an intentional scroll must never be reverted).

import { useCallback, useRef } from 'react'

export const SCROLL_GUARD_PX = 8

export interface ScrollSnapshot {
  windowY: number
  elements: Record<string, number>
}

type ScrollRoot = Document | HTMLElement

function ownerWindow(root: ScrollRoot): Window | null {
  if (typeof window === 'undefined') return null
  return root === document ? window : root.ownerDocument?.defaultView ?? window
}

function readWindowY(root: ScrollRoot): number {
  const win = ownerWindow(root)
  return win ? win.scrollY : 0
}

/** Snapshot the window scroll and every keyed scroll container under `root`. */
export function captureScroll(root: ScrollRoot = document): ScrollSnapshot {
  const elements: Record<string, number> = {}
  root.querySelectorAll<HTMLElement>('[data-scroll-key]').forEach((el) => {
    const key = el.dataset.scrollKey
    if (key) elements[key] = el.scrollTop
  })
  return { windowY: readWindowY(root), elements }
}

/**
 * Put a snapshot back. Elements and the window are both restored only while
 * they are still within `guardPx` of the snapshot; anything further moved was
 * a deliberate scroll during the refresh and must never be reverted.
 */
export function restoreScroll(
  snapshot: ScrollSnapshot,
  root: ScrollRoot = document,
  guardPx: number = SCROLL_GUARD_PX,
): void {
  const win = ownerWindow(root)
  if (win && snapshot.windowY > 0 && Math.abs(win.scrollY - snapshot.windowY) <= guardPx) {
    win.scrollTo(0, snapshot.windowY)
  }
  root.querySelectorAll<HTMLElement>('[data-scroll-key]').forEach((el) => {
    const key = el.dataset.scrollKey
    if (!key || !(key in snapshot.elements)) return
    const target = snapshot.elements[key]
    if (target > 0 && Math.abs(el.scrollTop - target) <= guardPx) el.scrollTop = target
  })
}

/** `capture` before a soft refresh, `restore` once the new data has committed. */
export function useScrollRestore(): {
  capture: () => void
  restore: () => void
} {
  const snapshot = useRef<ScrollSnapshot | null>(null)

  const capture = useCallback(() => {
    snapshot.current = captureScroll()
  }, [])

  const restore = useCallback(() => {
    const saved = snapshot.current
    snapshot.current = null
    if (!saved) return
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => restoreScroll(saved))
    } else {
      restoreScroll(saved)
    }
  }, [])

  return { capture, restore }
}
