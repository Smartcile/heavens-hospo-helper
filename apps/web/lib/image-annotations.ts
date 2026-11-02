// Image annotation layers — pure types + sanitisers shared by the annotator
// component, the admin API and the PDF renderer. Prisma-free: the annotator
// runs in the browser.
//
// A layer is drawing + text data stored OVER an image. The image file itself
// is never modified, so the layer can be re-edited or removed and the original
// picture is untouched. All coordinates are fractions of the image box (0–1),
// so a layer renders identically at any display size.

export type AnnotationTool = 'pen' | 'line' | 'arrow' | 'box'

export type AnnotationPoint = {
  x: number
  y: number
}

export type AnnotationShape = {
  tool: AnnotationTool
  color: string
  /** Stroke width as a fraction of the image height (e.g. 0.008). */
  width: number
  /** pen: the full path; line / arrow / box: exactly [from, to]. */
  points: AnnotationPoint[]
}

export type AnnotationText = {
  x: number
  y: number
  text: string
  color: string
  /** Font size as a fraction of the image height (e.g. 0.045). */
  size: number
}

export type AnnotationData = {
  shapes: AnnotationShape[]
  texts: AnnotationText[]
}

export const ANNOTATION_COLOURS = ['#EF4444', '#F59E0B', '#22C55E', '#3B82F6', '#FFFFFF', '#111827'] as const

/** Thin / medium / thick — fractions of the image height. */
export const ANNOTATION_WIDTHS = [0.004, 0.008, 0.016] as const
export const DEFAULT_ANNOTATION_WIDTH = ANNOTATION_WIDTHS[1]
export const DEFAULT_ANNOTATION_SIZE = 0.045

export const MAX_ANNOTATION_SHAPES = 400
export const MAX_ANNOTATION_POINTS = 2000
export const MAX_ANNOTATION_TEXTS = 100
export const MAX_ANNOTATION_TEXT_LEN = 200

export function emptyAnnotation(): AnnotationData {
  return { shapes: [], texts: [] }
}

export function annotationIsEmpty(data: AnnotationData): boolean {
  return data.shapes.length === 0 && data.texts.length === 0
}

function clamp01(raw: unknown): number | null {
  const v = typeof raw === 'number' ? raw : parseFloat(String(raw))
  if (!isFinite(v)) return null
  return Math.min(1, Math.max(0, v))
}

/** Clamp a number into [0, 1] (annotation coordinates are fractions). */
export function clamp01Value(v: number): number {
  return Math.min(1, Math.max(0, v))
}

/**
 * Three points of an arrowhead for an arrow from `to` pointing along
 * from → to, in the same coordinate units as the inputs. Shared by the SVG
 * overlay and the PDF renderer — callers must pass PIXEL-space points (see
 * `plotArrow`) so a non-square image cannot distort the head.
 */
export function arrowHead(from: AnnotationPoint, to: AnnotationPoint, length: number): AnnotationPoint[] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const baseX = to.x - ux * length
  const baseY = to.y - uy * length
  const half = length * 0.4
  return [to, { x: baseX - uy * half, y: baseY + ux * half }, { x: baseX + uy * half, y: baseY - ux * half }]
}

export interface ArrowGeometry {
  /** The shaft, already shortened to the head's base so the round cap can't blob the tip. */
  shaft: [AnnotationPoint, AnnotationPoint]
  head: [AnnotationPoint, AnnotationPoint, AnnotationPoint]
}

/**
 * Pixel-space arrow geometry from fraction-space points: both the shaft and the
 * head are computed in one uniform space, so the head keeps its true
 * proportions at any image aspect ratio. The head is sized from the stroke
 * width and capped for very short arrows.
 */
export function plotArrow(
  from: AnnotationPoint,
  to: AnnotationPoint,
  w: number,
  h: number,
  width: number,
): ArrowGeometry {
  const a = { x: from.x * w, y: from.y * h }
  const b = { x: to.x * w, y: to.y * h }
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const strokePx = Math.max(1, width * h)
  const headLen = Math.max(2, Math.min(strokePx * 3.6, len * 0.75))
  const head = arrowHead(a, b, headLen) as [AnnotationPoint, AnnotationPoint, AnnotationPoint]
  const base = { x: (head[1].x + head[2].x) / 2, y: (head[1].y + head[2].y) / 2 }
  return { shaft: [a, base], head }
}

export interface AnnotationBounds {
  x: number
  y: number
  w: number
  h: number
}

/** Approximate width of one line of the monospace label font. */
export function textLineWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.62
}

/**
 * Pixel bounds of a text label. `t.x` / `t.y` are the baseline anchor; the box
 * includes the padding the on-screen plate draws around the glyphs.
 */
export function annotationTextBounds(t: AnnotationText, w: number, h: number): AnnotationBounds {
  const font = Math.max(1, t.size * h)
  const padX = font * 0.28
  const padY = font * 0.22
  return {
    x: t.x * w - padX,
    y: t.y * h - font * 0.82 - padY,
    w: textLineWidth(t.text, font) + padX * 2,
    h: font * 1.05 + padY * 2,
  }
}

/** Pixel bounding box of a shape, padded by its stroke half-width. */
export function shapeBounds(shape: AnnotationShape, w: number, h: number): AnnotationBounds {
  const xs = shape.points.map((p) => p.x * w)
  const ys = shape.points.map((p) => p.y * h)
  const pad = Math.max(2, shape.width * h * 0.75)
  const minX = Math.min(...xs) - pad
  const maxX = Math.max(...xs) + pad
  const minY = Math.min(...ys) - pad
  const maxY = Math.max(...ys) + pad
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export type AnnotationSelection = { kind: 'shape' | 'text'; index: number }

/**
 * What is under a fraction-space point? Texts sit on top of shapes, and within
 * each kind the newest annotation wins — matching what the eye sees. Tolerance
 * scales with the stroke width with an 8px floor, so thin lines are still easy
 * to grab.
 */
export function hitTestAnnotation(
  data: AnnotationData,
  point: AnnotationPoint,
  w: number,
  h: number,
): AnnotationSelection | null {
  const px = point.x * w
  const py = point.y * h

  for (let i = data.texts.length - 1; i >= 0; i--) {
    const b = annotationTextBounds(data.texts[i], w, h)
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return { kind: 'text', index: i }
  }

  for (let i = data.shapes.length - 1; i >= 0; i--) {
    const shape = data.shapes[i]
    const tol = Math.max(8, shape.width * h * 1.5)
    const pts = shape.points.map((p) => ({ x: p.x * w, y: p.y * h }))
    if (shape.tool === 'box') {
      const [a, b] = pts
      const corners = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }]
      for (let k = 0; k < corners.length; k++) {
        const p = corners[k]
        const q = corners[(k + 1) % corners.length]
        if (distanceToSegment(px, py, p.x, p.y, q.x, q.y) <= tol) return { kind: 'shape', index: i }
      }
    } else {
      for (let k = 1; k < pts.length; k++) {
        if (distanceToSegment(px, py, pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y) <= tol) {
          return { kind: 'shape', index: i }
        }
      }
    }
  }
  return null
}

/** Pixel bounds of whichever annotation is selected. */
export function selectionBounds(
  data: AnnotationData,
  sel: AnnotationSelection,
  w: number,
  h: number,
): AnnotationBounds | null {
  if (sel.kind === 'shape') {
    const shape = data.shapes[sel.index]
    return shape ? shapeBounds(shape, w, h) : null
  }
  const text = data.texts[sel.index]
  return text ? annotationTextBounds(text, w, h) : null
}

/** Clamp a translation so the item's pixel bounds stay inside the image. */
export function clampTranslation(
  bounds: AnnotationBounds,
  dx: number,
  dy: number,
  w: number,
  h: number,
): { dx: number; dy: number } {
  return {
    dx: Math.max(-bounds.x, Math.min(w - (bounds.x + bounds.w), dx)),
    dy: Math.max(-bounds.y, Math.min(h - (bounds.y + bounds.h), dy)),
  }
}

/**
 * Move one annotation by a pixel delta (clamped to the image), returning the
 * next layer. Non-selected items are passed through by reference.
 */
export function translateAnnotation(
  data: AnnotationData,
  sel: AnnotationSelection,
  dxPx: number,
  dyPx: number,
  w: number,
  h: number,
): AnnotationData {
  const bounds = selectionBounds(data, sel, w, h)
  if (!bounds) return data
  const { dx, dy } = clampTranslation(bounds, dxPx, dyPx, w, h)
  const fx = dx / w
  const fy = dy / h
  if (sel.kind === 'shape') {
    return {
      ...data,
      shapes: data.shapes.map((s, i) => (i === sel.index
        ? { ...s, points: s.points.map((p) => ({ x: clamp01Value(p.x + fx), y: clamp01Value(p.y + fy) })) }
        : s)),
    }
  }
  return {
    ...data,
    texts: data.texts.map((t, i) => (i === sel.index
      ? { ...t, x: clamp01Value(t.x + fx), y: clamp01Value(t.y + fy) }
      : t)),
  }
}

/** Delete one annotation (history makes it undoable in the annotator). */
export function removeAnnotation(data: AnnotationData, sel: AnnotationSelection): AnnotationData {
  if (sel.kind === 'shape') return { ...data, shapes: data.shapes.filter((_, i) => i !== sel.index) }
  return { ...data, texts: data.texts.filter((_, i) => i !== sel.index) }
}

/** True when a hex colour is light enough to need a dark plate behind it. */
export function isLightColour(color: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(color)
  if (!m) return false
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6
}

/**
 * The plate drawn behind a text label so it reads on any photo — dark behind
 * light text, light behind dark text (a white plate would hide white labels).
 */
export function annotationPlateFill(color: string): string {
  return isLightColour(color) ? 'rgba(10,10,10,0.65)' : 'rgba(255,255,255,0.85)'
}

function toPoint(raw: unknown): AnnotationPoint | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as { x?: unknown; y?: unknown }
  const x = clamp01(p.x)
  const y = clamp01(p.y)
  if (x === null || y === null) return null
  return { x, y }
}

function toColour(raw: unknown): string {
  return typeof raw === 'string' && (ANNOTATION_COLOURS as readonly string[]).includes(raw.toUpperCase())
    ? raw.toUpperCase()
    : ANNOTATION_COLOURS[0]
}

function toWidth(raw: unknown): number {
  const v = typeof raw === 'number' ? raw : parseFloat(String(raw))
  return (ANNOTATION_WIDTHS as readonly number[]).includes(v) ? v : DEFAULT_ANNOTATION_WIDTH
}

/** Coerce unknown JSON into a safe, bounded AnnotationData. Never throws. */
export function normaliseAnnotation(raw: unknown): AnnotationData {
  const src = raw && typeof raw === 'object' ? (raw as { shapes?: unknown; texts?: unknown }) : {}

  const shapes: AnnotationShape[] = []
  const rawShapes = Array.isArray(src.shapes) ? src.shapes.slice(0, MAX_ANNOTATION_SHAPES) : []
  for (const item of rawShapes) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    const tool = s.tool
    if (tool !== 'pen' && tool !== 'line' && tool !== 'arrow' && tool !== 'box') continue
    const rawPoints = Array.isArray(s.points) ? s.points.slice(0, MAX_ANNOTATION_POINTS) : []
    const points: AnnotationPoint[] = []
    for (const rp of rawPoints) {
      const p = toPoint(rp)
      if (p) points.push(p)
    }
    const minPoints = 2
    if (points.length < minPoints) continue
    shapes.push({
      tool,
      color: toColour(s.color),
      width: toWidth(s.width),
      points: tool === 'pen' ? points : points.slice(0, 2),
    })
  }

  const texts: AnnotationText[] = []
  const rawTexts = Array.isArray(src.texts) ? src.texts.slice(0, MAX_ANNOTATION_TEXTS) : []
  for (const item of rawTexts) {
    if (!item || typeof item !== 'object') continue
    const t = item as Record<string, unknown>
    const text = typeof t.text === 'string' ? t.text.trim().slice(0, MAX_ANNOTATION_TEXT_LEN) : ''
    const x = clamp01(t.x)
    const y = clamp01(t.y)
    if (!text || x === null || y === null) continue
    const sizeRaw = typeof t.size === 'number' ? t.size : parseFloat(String(t.size))
    const size = isFinite(sizeRaw) ? Math.min(0.2, Math.max(0.01, sizeRaw)) : DEFAULT_ANNOTATION_SIZE
    texts.push({ x, y, text, color: toColour(t.color), size })
  }

  return { shapes, texts }
}

// ── Usage keys ──────────────────────────────────────────────────────────
// A usage key names the ONE place a layer belongs to, so the same file used in
// several areas keeps separate notes. Keep these builders in one place so the
// editor and the reader always agree on the key.

export function guideStepUsageKey(stepId: string): string {
  return `guide-step:${stepId}`
}

export function guideRowUsageKey(rowId: string, columnKey: string): string {
  return `guide-row:${rowId}:${columnKey}`
}

export function menuItemUsageKey(menuItemId: string): string {
  return `menu-item:${menuItemId}`
}

export function inventoryItemUsageKey(itemId: string): string {
  return `inventory-item:${itemId}`
}

export interface ImageAnnotationLayer {
  imageUrl: string
  data: AnnotationData
}

/** The layer for one URL within the layers returned for a usage. */
export function annotationForUrl(
  layers: readonly ImageAnnotationLayer[] | null | undefined,
  url: string,
): AnnotationData | null {
  return layers?.find((l) => l.imageUrl === url)?.data ?? null
}
