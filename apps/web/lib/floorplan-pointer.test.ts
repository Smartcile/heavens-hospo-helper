import { describe, it, expect } from 'vitest'
import {
  screenToWorld,
  worldToScreen,
  screenDeltaToWorld,
  clampZoom,
  zoomAroundPoint,
  zoomAroundCenter,
  gridSnap,
  edgeSnap,
  snapValue,
  clampToRoom,
  clampPosition,
  findMagneticSnap,
  edgeOverlapRatio,
  shouldJoin,
  JOIN_OVERLAP_RATIO,
  IDLE_GESTURE,
  beginGesture,
  moveGesture,
  endGesture,
  cancelGesture,
  gestureAccepts,
  DRAG_SLOP_PX,
  nudgeDirectionForKey,
  nudgeStep,
  nudgeDelta,
  isTypingTarget,
  type ViewTransform,
  type Placement,
} from './floorplan-pointer'

/** baseScale 0.5, centred at (100,50), zoom 2, panned right 40 / up 20. */
const view: ViewTransform = { baseScale: 0.5, ox: 100, oy: 50, zoom: 2, panX: 40, panY: -20 }

const table: Placement = { x: 0, y: 0, width: 80, depth: 80, rotation: 0 }

describe('screenToWorld', () => {
  it('includes the pan offset (the wall/zone point bug)', () => {
    // x = (300 - 100 - 40) / (0.5 * 2) = 160
    // y = (200 - 50 + 20) / 1         = 170
    expect(screenToWorld(view, 300, 200)).toEqual({ x: 160, y: 170 })
  })

  it('omitting pan would be wrong — guards the exact regression', () => {
    const withPan = screenToWorld(view, 300, 200)
    const withoutPan = screenToWorld({ ...view, panX: 0, panY: 0 }, 300, 200)
    expect(withPan.x).not.toBe(withoutPan.x)
    expect(withPan.y).not.toBe(withoutPan.y)
  })

  it('round-trips with worldToScreen at any zoom and pan', () => {
    const screen = { x: 512, y: 233 }
    const world = screenToWorld(view, screen.x, screen.y)
    const back = worldToScreen(view, world.x, world.y)
    expect(back.x).toBeCloseTo(screen.x, 10)
    expect(back.y).toBeCloseTo(screen.y, 10)
  })

  it('never divides by zero when the view is empty', () => {
    const zero = { baseScale: 0, ox: 0, oy: 0, zoom: 0, panX: 0, panY: 0 }
    expect(Number.isFinite(screenToWorld(zero, 10, 10).x)).toBe(true)
  })
})

describe('screenDeltaToWorld', () => {
  it('scales a drag delta by baseScale * zoom', () => {
    expect(screenDeltaToWorld(view, 20, -10)).toEqual({ x: 20, y: -10 })
    expect(screenDeltaToWorld({ ...view, zoom: 1 }, 20, 10)).toEqual({ x: 40, y: 20 })
  })
})

describe('zoom', () => {
  it('clamps to the canvas limits', () => {
    expect(clampZoom(0.01)).toBe(0.2)
    expect(clampZoom(99)).toBe(5)
    expect(clampZoom(1.5)).toBe(1.5)
  })

  it('keeps the room point under the pointer fixed', () => {
    const anchor = { x: 420, y: 310 }
    const before = screenToWorld(view, anchor.x, anchor.y)
    const next = zoomAroundPoint(view, 3.4, anchor.x, anchor.y)
    const after = screenToWorld({ ...view, ...next }, anchor.x, anchor.y)
    expect(after.x).toBeCloseTo(before.x, 10)
    expect(after.y).toBeCloseTo(before.y, 10)
  })

  it('anchors the toolbar slider on the viewport centre', () => {
    const centre = { x: 400, y: 300 }
    const before = screenToWorld(view, centre.x, centre.y)
    const next = zoomAroundCenter(view, 0.4, 800, 600)
    const after = screenToWorld({ ...view, ...next }, centre.x, centre.y)
    expect(next.zoom).toBe(0.4)
    expect(after.x).toBeCloseTo(before.x, 10)
    expect(after.y).toBeCloseTo(before.y, 10)
  })

  it('zooming out moves the pan so the plan does not drift', () => {
    const next = zoomAroundCenter(view, 0.5, 800, 600)
    // The centre point stays put even though the pan changed.
    const centreWorldBefore = screenToWorld(view, 400, 300)
    const centreWorldAfter = screenToWorld({ ...view, ...next }, 400, 300)
    expect(centreWorldAfter).toEqual(centreWorldBefore)
  })
})

describe('grid snapping', () => {
  it('rounds to the nearest line', () => {
    expect(gridSnap(12, 10)).toBe(10)
    expect(gridSnap(18, 10)).toBe(20)
    expect(gridSnap(12, 0)).toBe(12)
  })

  it('snaps by the closest edge, not just the origin', () => {
    // 69 with a 10 grid: left 70 (dist 1), right edge 149 -> 150 - 80 = 70 … left wins.
    expect(edgeSnap(69, 80, 10)).toBe(70)
    // 18 with a 10 grid: left 20 (dist 2), right edge 98 -> 100 - 80 = 20.
    expect(edgeSnap(18, 80, 10)).toBe(20)
  })

  it('snapValue only snaps when already close to a line', () => {
    expect(snapValue(48, 80, 10, 5)).toBe(50)
    expect(snapValue(56, 80, 10, 2)).toBe(56)
    expect(snapValue(43, 80, 0, 5)).toBe(43)
  })
})

describe('clamping', () => {
  it('keeps an item inside the room', () => {
    expect(clampToRoom(-10, 80, 400)).toBe(0)
    expect(clampToRoom(390, 80, 400)).toBe(320)
    expect(clampToRoom(120, 80, 400)).toBe(120)
  })

  it('pins an oversized item at zero rather than a negative position', () => {
    expect(clampToRoom(20, 500, 400)).toBe(0)
  })

  it('clamps both axes', () => {
    expect(clampPosition(-5, 999, 80, 80, 400, 300)).toEqual({ x: 0, y: 220 })
  })
})

describe('findMagneticSnap', () => {
  it('closes the gap to a flush neighbour without sliding along the edge', () => {
    const item = { ...table, x: 85, y: 10 }
    const snap = findMagneticSnap(item, [table], 15)
    expect(snap).not.toBeNull()
    expect(snap!.x).toBe(80)
    expect(snap!.y).toBe(10) // the 10cm along-edge offset is kept
    expect(snap!.targetIndex).toBe(0)
  })

  it('does nothing beyond the threshold', () => {
    expect(findMagneticSnap({ ...table, x: 120 }, [table], 15)).toBeNull()
  })

  it('does nothing without targets', () => {
    expect(findMagneticSnap({ ...table, x: 85 }, [], 15)).toBeNull()
  })

  it('never snaps a placement on top of an overlapping one', () => {
    expect(findMagneticSnap({ ...table, x: 10 }, [table], 15)).toBeNull()
  })

  it('snaps a vertical approach too', () => {
    const snap = findMagneticSnap({ ...table, y: 85 }, [table], 15)
    expect(snap).not.toBeNull()
    expect(snap!.y).toBe(80)
  })

  it('reports an already-flush placement as a zero-distance candidate', () => {
    // No gap to close, but the caller still needs to know which table it is
    // flush with so an explicit join can be considered.
    const snap = findMagneticSnap({ ...table, x: 80 }, [table], 15)
    expect(snap).not.toBeNull()
    expect(snap!.x).toBe(80)
    expect(snap!.y).toBe(0)
    expect(snap!.targetIndex).toBe(0)
  })
})

describe('explicit join', () => {
  it('a flush side-by-side pair overlaps fully', () => {
    expect(edgeOverlapRatio({ ...table, x: 80 }, table)).toBeCloseTo(1, 6)
  })

  it('a small accidental nudge is well below the join threshold', () => {
    // 30 of the 80cm edge overlaps -> 0.375
    const nudged = { ...table, x: 80, y: 50 }
    expect(edgeOverlapRatio(nudged, table)).toBeCloseTo(0.375, 6)
    expect(edgeOverlapRatio(nudged, table)).toBeLessThan(JOIN_OVERLAP_RATIO)
    expect(shouldJoin(nudged, table)).toBe(false)
  })

  it('a deliberate long overlap joins', () => {
    expect(shouldJoin({ ...table, x: 80, y: 10 }, table)).toBe(true)
  })

  it('joins an exactly flush release with a zero-distance gap', () => {
    // Regression: the magnetic candidate used to skip perp <= 0, so a table
    // released exactly flush never produced a join.
    const flush = { ...table, x: 80, y: 0 }
    expect(findMagneticSnap(flush, [table], 15)).not.toBeNull()
    expect(edgeOverlapRatio(flush, table)).toBeCloseTo(1, 6)
    expect(shouldJoin(flush, table)).toBe(true)
  })

  it('Shift joins a partial flush fit outright', () => {
    const nudged = { ...table, x: 80, y: 50 }
    expect(shouldJoin(nudged, table)).toBe(false)
    expect(shouldJoin(nudged, table, { shiftHeld: true })).toBe(true)
  })

  it('non-parallel edges never join', () => {
    const angled = { ...table, x: 80, rotation: 45 }
    expect(edgeOverlapRatio(angled, table)).toBe(0)
    expect(shouldJoin(angled, table, { shiftHeld: true })).toBe(false)
  })

  it('separated tables never join', () => {
    expect(shouldJoin({ ...table, x: 200 }, table)).toBe(false)
  })
})

describe('gesture state machine', () => {
  it('starts idle', () => {
    expect(IDLE_GESTURE.kind).toBe('idle')
  })

  it('begin bumps the token so a competing gesture wins', () => {
    const a = beginGesture(IDLE_GESTURE, 'dragging', 10, 10)
    const b = beginGesture(a, 'selecting', 20, 20)
    expect(a.token).toBe(1)
    expect(b.token).toBe(2)
    expect(gestureAccepts(a, a.token)).toBe(true)
    expect(gestureAccepts(b, a.token)).toBe(false)
    expect(b.kind).toBe('selecting')
  })

  it('tracks movement past the slop threshold', () => {
    const s = beginGesture(IDLE_GESTURE, 'dragging', 0, 0)
    const tiny = moveGesture(s, DRAG_SLOP_PX - 1, 0)
    expect(tiny.moved).toBe(false)
    const moved = moveGesture(tiny, DRAG_SLOP_PX + 1, 0)
    expect(moved.moved).toBe(true)
    expect(moved.lastX).toBe(DRAG_SLOP_PX + 1)
  })

  it('ignores moves while idle', () => {
    expect(moveGesture(IDLE_GESTURE, 100, 100)).toBe(IDLE_GESTURE)
  })

  it('end returns to idle but keeps the token and last position', () => {
    const s = moveGesture(beginGesture(IDLE_GESTURE, 'dragging', 0, 0), 40, 25)
    const ended = endGesture(s)
    expect(ended.kind).toBe('idle')
    expect(ended.token).toBe(s.token)
    expect(ended.lastX).toBe(40)
    expect(ended.lastY).toBe(25)
    expect(gestureAccepts(ended, s.token)).toBe(false)
  })

  it('cancel invalidates the running gesture (the stuck-drag escape)', () => {
    const s = beginGesture(IDLE_GESTURE, 'dragging', 0, 0)
    const cancelled = cancelGesture(s)
    expect(cancelled.kind).toBe('idle')
    expect(cancelled.token).toBe(s.token + 1)
    expect(gestureAccepts(cancelled, s.token)).toBe(false)
  })
})

describe('keyboard helpers', () => {
  it('maps arrow keys', () => {
    expect(nudgeDirectionForKey('ArrowLeft')).toBe('left')
    expect(nudgeDirectionForKey('ArrowDown')).toBe('down')
    expect(nudgeDirectionForKey('a')).toBeNull()
  })

  it('nudges a grid unit, or 1cm with Shift', () => {
    expect(nudgeStep(false, 50)).toBe(50)
    expect(nudgeStep(true, 50)).toBe(1)
    expect(nudgeStep(false, 0)).toBe(1)
  })

  it('produces the right delta', () => {
    expect(nudgeDelta('left', 50)).toEqual({ x: -50, y: 0 })
    expect(nudgeDelta('up', 1)).toEqual({ x: 0, y: -1 })
  })

  it('detects a text field so arrows are not hijacked', () => {
    expect(isTypingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true)
    expect(isTypingTarget({ tagName: 'select' } as unknown as EventTarget)).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
