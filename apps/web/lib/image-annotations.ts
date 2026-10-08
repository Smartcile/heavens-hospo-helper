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
 * overlay and the PDF renderer.
 */
export function arrowHead(from: AnnotationPoint, to: AnnotationPoint, length: number): AnnotationPoint[] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const baseX = to.x - ux * length
  const baseY = to.y - uy * length
  const half = length * 0.45
  return [to, { x: baseX - uy * half, y: baseY + ux * half }, { x: baseX + uy * half, y: baseY - ux * half }]
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
