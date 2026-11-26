/**
 * Pure pointer, coordinate and gesture maths for the floor-plan canvas.
 *
 * Everything here used to live inline in `floorplan-pixi.tsx`, duplicated per
 * handler — and that duplication is what made click-and-drag unreliable
 * (issue #194): wall/zone points were converted without the pan offset, drag
 * feedback applied snapping on every frame, and three `pointerdown` handlers
 * competed for one gesture. The canvas has no test harness (Pixi + jsdom), so
 * the arithmetic lives here where it can be unit-tested.
 *
 * Prisma-free, DOM-free and client-safe.
 */

export interface Point {
  x: number
  y: number
}

/**
 * The room transform shared through `viewRef`. Room-space units are real-world
 * centimetres; `baseScale` fits the room into the viewport, `zoom` multiplies
 * it, and `ox/oy` centre it while `panX/panY` is the user's pan offset.
 */
export interface ViewTransform {
  baseScale: number
  ox: number
  oy: number
  zoom: number
  panX: number
  panY: number
}

// ── Coordinates ─────────────────────────────────────────────────────────────

/**
 * Canvas-local CSS pixels → room centimetres.
 *
 * This is the **only** conversion the canvas may use. Wall points, zone
 * polygon points, zone draw, the selection rectangle, palette drops and the
 * keyboard nudge all route through it, so a pan can never offset one of them
 * by itself (the original bug: wall/zone points forgot `panX/panY`).
 */
export function screenToWorld(vs: ViewTransform, screenX: number, screenY: number): Point {
  const scale = vs.baseScale * vs.zoom || 1
  return {
    x: (screenX - vs.ox - vs.panX) / scale,
    y: (screenY - vs.oy - vs.panY) / scale,
  }
}

/** Room centimetres → canvas-local CSS pixels. */
export function worldToScreen(vs: ViewTransform, worldX: number, worldY: number): Point {
  const scale = vs.baseScale * vs.zoom || 1
  return {
    x: vs.ox + vs.panX + worldX * scale,
    y: vs.oy + vs.panY + worldY * scale,
  }
}

/** The world-space distance a screen-space drag of `dx/dy` covers at this zoom. */
export function screenDeltaToWorld(vs: ViewTransform, dx: number, dy: number): Point {
  const scale = vs.baseScale * vs.zoom || 1
  return { x: dx / scale, y: dy / scale }
}

// ── Zoom ────────────────────────────────────────────────────────────────────

export const ZOOM_MIN = 0.2
export const ZOOM_MAX = 5

export function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))
}

/**
 * Change the zoom while keeping the room point under the pointer fixed.
 *
 * The zoom slider used to write `zoom` alone, so the plan stepped away from
 * the viewport as you zoomed out.
 */
export function zoomAroundPoint(
  vs: ViewTransform,
  newZoom: number,
  screenX: number,
  screenY: number,
): { zoom: number; panX: number; panY: number } {
  const zoom = clampZoom(newZoom)
  const scale = vs.baseScale * vs.zoom || 1
  const worldX = (screenX - vs.ox - vs.panX) / scale
  const worldY = (screenY - vs.oy - vs.panY) / scale
  return {
    zoom,
    panX: screenX - worldX * vs.baseScale * zoom - vs.ox,
    panY: screenY - worldY * vs.baseScale * zoom - vs.oy,
  }
}

/** Zoom anchored on the centre of the viewport (what the toolbar slider does). */
export function zoomAroundCenter(
  vs: ViewTransform,
  newZoom: number,
  width: number,
  height: number,
): { zoom: number; panX: number; panY: number } {
  return zoomAroundPoint(vs, newZoom, width / 2, height / 2)
}

// ── Snapping and clamping ───────────────────────────────────────────────────

export function gridSnap(value: number, unit: number): number {
  if (!unit || unit <= 0) return value
  return Math.round(value / unit) * unit
}

/**
 * Edge-aware grid snap: picks whichever of the element's leading or trailing
 * edge is closest to a grid line, so a table snaps by its right edge just as
 * readily as its left.
 */
export function edgeSnap(value: number, size: number, unit: number): number {
  const left = gridSnap(value, unit)
  const right = gridSnap(value + size, unit) - size
  return Math.abs(value - left) < Math.abs(value - right) ? left : right
}

/**
 * Grid snap that only fires when the edge is already close to a line.
 *
 * Applying a snap only on release is not enough on its own: a release halfway
 * between two lines still jumps by up to half the grid. This keeps free
 * placement where the pointer left the item and only tidies it when it is
 * genuinely near a line.
 */
export function snapValue(value: number, size: number, unit: number, tolerance: number): number {
  if (!unit || unit <= 0) return value
  const left = gridSnap(value, unit)
  const right = gridSnap(value + size, unit) - size
  const dLeft = Math.abs(value - left)
  const dRight = Math.abs(value - right)
  const best = dLeft <= dRight ? left : right
  return Math.min(dLeft, dRight) <= tolerance ? best : value
}

/** Keep a position inside the room; a room smaller than the item pins it at 0. */
export function clampToRoom(value: number, size: number, roomSize: number): number {
  return Math.max(0, Math.min(value, roomSize - size))
}

export function clampPosition(
  x: number,
  y: number,
  width: number,
  depth: number,
  roomWidth: number,
  roomDepth: number,
): Point {
  return {
    x: clampToRoom(x, width, roomWidth),
    y: clampToRoom(y, depth, roomDepth),
  }
}

// ── Magnetic snapping ───────────────────────────────────────────────────────

/** A placed rectangle in room space: top-left origin, degrees of rotation. */
export interface Placement {
  x: number
  y: number
  width: number
  depth: number
  rotation: number
}

export interface MagneticSnap {
  x: number
  y: number
  rotation: number
  targetIndex: number
}

interface EdgeSegment {
  x1: number
  y1: number
  x2: number
  y2: number
  len: number
  ux: number
  uy: number
  nx: number
  ny: number
  midX: number
  midY: number
}

const DEG = Math.PI / 180
/** cos tolerance for "parallel": about 5°. */
const PARALLEL_DOT = 0.996
/** Two edges are "the same edge" when their lines are within this many cm. */
const COINCIDENT_CM = 1
/** Overlap (as a fraction of the shorter edge) needed to join automatically. */
export const JOIN_OVERLAP_RATIO = 0.6

function cornersOf(p: Placement): [number, number][] {
  const hw = p.width / 2
  const hd = p.depth / 2
  const cx = p.x + hw
  const cy = p.y + hd
  const cos = Math.cos(p.rotation * DEG)
  const sin = Math.sin(p.rotation * DEG)
  const local: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ]
  return local.map(([lx, ly]) => [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos])
}

function edgesOf(corners: [number, number][]): EdgeSegment[] {
  return corners.map((_, i) => {
    const j = (i + 1) % 4
    const [x1, y1] = corners[i]
    const [x2, y2] = corners[j]
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    return {
      x1,
      y1,
      x2,
      y2,
      len,
      ux: dx / len,
      uy: dy / len,
      nx: -dy / len,
      ny: dx / len,
      midX: (x1 + x2) / 2,
      midY: (y1 + y2) / 2,
    }
  })
}

/** Bounding boxes overlap at all — used to skip stacking snaps. */
function bboxesOverlap(a: Placement, b: Placement): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.depth &&
    a.y + a.depth > b.y
  )
}

/**
 * Find the closest flush-fit against another same-type placement.
 *
 * Only the *candidate* is returned — the canvas shows it as a guide while
 * dragging and applies it on release. Nothing here mutates.
 *
 * The item's edge must *face* the target (its outward normal points at the
 * target edge) so dragging a table near another snaps it alongside, never on
 * top: a placement already overlapping a target is left alone.
 */
export function findMagneticSnap(
  item: Placement,
  targets: Placement[],
  threshold: number,
): MagneticSnap | null {
  if (targets.length === 0 || threshold <= 0) return null
  const itemEdges = edgesOf(cornersOf(item))
  let bestDist = threshold
  let best: MagneticSnap | null = null

  for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
    const target = targets[targetIndex]
    if (bboxesOverlap(item, target)) continue
    const targetCorners = cornersOf(target)
    for (let ti = 0; ti < 4; ti++) {
      const [tx1, ty1] = targetCorners[ti]
      const [tx2, ty2] = targetCorners[(ti + 1) % 4]
      const tdx = tx2 - tx1
      const tdy = ty2 - ty1
      const tlen = Math.sqrt(tdx * tdx + tdy * tdy) || 1
      const tux = tdx / tlen
      const tuy = tdy / tlen

      for (const ie of itemEdges) {
        if (Math.abs(ie.ux * tux + ie.uy * tuy) < PARALLEL_DOT) continue

        // Outward normal (winding is top-left → top-right → bottom-right →
        // bottom-left, so the outward normal is (uy, -ux)).
        const ox = ie.uy
        const oy = -ie.ux
        const dmx = (tx1 + tx2) / 2 - ie.midX
        const dmy = (ty1 + ty2) / 2 - ie.midY

        // Only close the gap: translate along the normal by the perpendicular
        // separation. Snapping must not also slide the item along the edge —
        // that made a release move the table further than the pointer did.
        const perp = dmx * ox + dmy * oy
        const dist = Math.abs(perp)
        if (dist >= bestDist) continue
        // The item approaches from outside: the target edge is on the outward
        // side. An overlapping placement is never snapped on top.
        if (perp <= 0) continue

        // The projections must overlap, otherwise it is not a flush fit.
        const projMin = Math.min(tx1 * ie.ux + ty1 * ie.uy, tx2 * ie.ux + ty2 * ie.uy)
        const projMax = Math.max(tx1 * ie.ux + ty1 * ie.uy, tx2 * ie.ux + ty2 * ie.uy)
        const projA = [ie.x1 * ie.ux + ie.y1 * ie.uy, ie.x2 * ie.ux + ie.y2 * ie.uy]
        const itemMin = Math.min(projA[0], projA[1])
        const itemMax = Math.max(projA[0], projA[1])
        if (itemMax <= projMin || projMax <= itemMin) continue

        bestDist = dist
        best = {
          x: item.x + perp * ox,
          y: item.y + perp * oy,
          rotation: target.rotation,
          targetIndex,
        }
      }
    }
  }
  return best
}

/**
 * How much of one placement's edge lies along the other's, as a fraction of
 * the shorter edge. 0 when no edges are parallel and touching.
 */
export function edgeOverlapRatio(a: Placement, b: Placement, coincidence = COINCIDENT_CM): number {
  const aEdges = edgesOf(cornersOf(a))
  const bEdges = edgesOf(cornersOf(b))
  let best = 0

  for (const ae of aEdges) {
    for (const be of bEdges) {
      if (Math.abs(ae.ux * be.ux + ae.uy * be.uy) < PARALLEL_DOT) continue
      // Perpendicular distance between the two edge lines.
      const perp = Math.abs((be.midX - ae.midX) * ae.nx + (be.midY - ae.midY) * ae.ny)
      if (perp > coincidence) continue

      const projB = [be.x1 * ae.ux + be.y1 * ae.uy, be.x2 * ae.ux + be.y2 * ae.uy]
      const bMin = Math.min(projB[0], projB[1])
      const bMax = Math.max(projB[0], projB[1])
      const projA = [ae.x1 * ae.ux + ae.y1 * ae.uy, ae.x2 * ae.ux + ae.y2 * ae.uy]
      const aMin = Math.min(projA[0], projA[1])
      const aMax = Math.max(projA[0], projA[1])
      const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin)
      if (overlap <= 0) continue
      best = Math.max(best, overlap / Math.min(ae.len, be.len))
    }
  }
  return best
}

export interface JoinOptions {
  /** Shift held — an explicit "join these" gesture. */
  shiftHeld?: boolean
  /** Minimum overlap of the shorter edge for an automatic join. */
  minRatio?: number
  coincidence?: number
}

/**
 * Join is explicit, never a side effect of a small move.
 *
 * A deliberate long overlap (≥ 60% of the shorter edge by default) joins, and
 * holding Shift joins a flush fit outright. A table nudged against another
 * stays ungrouped.
 */
export function shouldJoin(dragged: Placement, target: Placement, opts: JoinOptions = {}): boolean {
  const ratio = edgeOverlapRatio(dragged, target, opts.coincidence)
  if (ratio <= 0) return false
  if (opts.shiftHeld) return true
  return ratio >= (opts.minRatio ?? JOIN_OVERLAP_RATIO)
}

// ── Gesture state machine ───────────────────────────────────────────────────

export type GestureKind = 'idle' | 'panning' | 'dragging' | 'drawing' | 'selecting'

export interface GestureState {
  kind: GestureKind
  /** Bumped on every begin/cancel so a stale closure can tell it lost the race. */
  token: number
  /** Pointer position (canvas CSS px) when the gesture began. */
  startX: number
  startY: number
  /** Latest pointer position. Kept after the gesture ends so `finish` can use it. */
  lastX: number
  lastY: number
  /** True once the pointer moved past the slop threshold. */
  moved: boolean
}

/** Movement below this many px is a click, not a drag. */
export const DRAG_SLOP_PX = 3

export const IDLE_GESTURE: GestureState = {
  kind: 'idle',
  token: 0,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
  moved: false,
}

/**
 * Start a gesture. The token always increases, so whatever handler was active
 * before (`begin` on a second pointerdown) can never commit afterwards — this
 * is the "no competing handlers, no stuck drags" rule.
 */
export function beginGesture(
  state: GestureState,
  kind: Exclude<GestureKind, 'idle'>,
  x: number,
  y: number,
): GestureState {
  return {
    kind,
    token: state.token + 1,
    startX: x,
    startY: y,
    lastX: x,
    lastY: y,
    moved: false,
  }
}

export function moveGesture(
  state: GestureState,
  x: number,
  y: number,
  slop = DRAG_SLOP_PX,
): GestureState {
  if (state.kind === 'idle') return state
  const moved = state.moved || Math.hypot(x - state.startX, y - state.startY) > slop
  if (x === state.lastX && y === state.lastY && moved === state.moved) return state
  return { ...state, lastX: x, lastY: y, moved }
}

/** End a gesture normally. The token is kept so `finish` sees the same value. */
export function endGesture(state: GestureState): GestureState {
  if (state.kind === 'idle') return state
  return { ...state, kind: 'idle' }
}

/** Abort a gesture (Escape, pointercancel, a competing pointerdown) and bump the token. */
export function cancelGesture(state: GestureState): GestureState {
  return { ...IDLE_GESTURE, token: state.token + 1 }
}

export function gestureAccepts(state: GestureState, token: number): boolean {
  return state.kind !== 'idle' && state.token === token
}

// ── Keyboard ────────────────────────────────────────────────────────────────

export type NudgeDirection = 'up' | 'down' | 'left' | 'right'

const NUDGE_KEYS: Record<string, NudgeDirection> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

export function nudgeDirectionForKey(key: string): NudgeDirection | null {
  return NUDGE_KEYS[key] ?? null
}

/** Grid unit normally, 1 cm when Shift is held. */
export function nudgeStep(shiftHeld: boolean, gridUnit: number): number {
  if (shiftHeld) return 1
  return gridUnit > 0 ? gridUnit : 1
}

export function nudgeDelta(direction: NudgeDirection, step: number): Point {
  switch (direction) {
    case 'up':
      return { x: 0, y: -step }
    case 'down':
      return { x: 0, y: step }
    case 'left':
      return { x: -step, y: 0 }
    case 'right':
      return { x: step, y: 0 }
  }
}

/**
 * Is the key event coming from a text field? Arrow keys and Delete must not be
 * hijacked while somebody is typing a dimension.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const el = target as { tagName?: string; isContentEditable?: boolean }
  const tag = (el.tagName ?? '').toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}
