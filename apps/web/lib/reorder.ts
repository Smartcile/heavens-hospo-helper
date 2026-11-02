// Pure geometry for pointer-based drag-reorder. Kept Prisma- and DOM-free so
// it can be unit-tested without a browser (the picker passes plain rects).

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Index of the rect whose centre is nearest to (x, y). Returns null for an
 * empty list. Used to decide which thumbnail a dragged image is over.
 */
export function nearestIndex(rects: Rect[], x: number, y: number): number | null {
  if (rects.length === 0) return null
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]
    const dx = x - (r.left + r.width / 2)
    const dy = y - (r.top + r.height / 2)
    const d = dx * dx + dy * dy
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}
