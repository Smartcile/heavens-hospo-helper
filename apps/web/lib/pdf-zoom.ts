// Pure zoom arithmetic for the in-app PDF viewer. No DOM, no React — the viewer
// feeds in pointer distances / scroll offsets and applies the result, so the
// gesture maths can be unit-tested without simulating a browser.

export const MIN_SCALE = 0.4
export const MAX_SCALE = 4
export const FIT_SCALE = 1
export const DOUBLE_TAP_SCALE = 2

export interface Point {
  x: number
  y: number
}

export interface ScrollOffset {
  left: number
  top: number
}

/** Keep a scale inside the viewer's zoom range. NaN falls to the minimum. */
export function clampScale(scale: number, min = MIN_SCALE, max = MAX_SCALE): number {
  if (Number.isNaN(scale)) return min
  return Math.min(max, Math.max(min, scale))
}

/**
 * Scale for a two-finger pinch: the ratio between the current and starting
 * finger distance, applied to the scale the pinch started at, then clamped.
 */
export function pinchScale(
  startScale: number,
  startDistance: number,
  currentDistance: number,
): number {
  if (!(startDistance > 0) || !(currentDistance > 0)) return clampScale(startScale)
  return clampScale(startScale * (currentDistance / startDistance))
}

/**
 * Scroll offsets that keep the content point under `point` (relative to the
 * scroll container) fixed while the scale changes from `scale` to `newScale`.
 */
export function zoomAroundPoint(
  scale: number,
  newScale: number,
  point: Point,
  scroll: ScrollOffset,
): ScrollOffset {
  if (!(scale > 0) || !Number.isFinite(scale) || !Number.isFinite(newScale)) {
    return { ...scroll }
  }
  const ratio = newScale / scale
  return {
    left: (scroll.left + point.x) * ratio - point.x,
    top: (scroll.top + point.y) * ratio - point.y,
  }
}

/** Double-tap target: fit (1.0) when already zoomed in, otherwise 2.0. */
export function toggleZoom(scale: number): number {
  return scale >= DOUBLE_TAP_SCALE - 0.01 ? FIT_SCALE : DOUBLE_TAP_SCALE
}
