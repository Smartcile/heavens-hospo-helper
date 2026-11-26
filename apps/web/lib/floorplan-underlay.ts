// Scaled reference-image underlay maths for the floor plan editor.
//
// The plan is stored in real-world centimetres while the uploaded drawing is in
// pixels, so the underlay is placed with `offsetX/offsetY` (cm) and `scale`
// (cm per image pixel). Everything here is pure and Prisma-free so the editor,
// the Pixi canvas and the calibration panel share one set of rules.

export interface UnderlayPoint {
  x: number
  y: number
}

export interface UnderlayState {
  imageUrl: string | null
  /** 0–1 render alpha. */
  opacity: number
  /** Room cm where the image's top-left pixel sits. */
  offsetX: number
  offsetY: number
  /** Centimetres represented by one image pixel. */
  scale: number
}

export const DEFAULT_UNDERLAY: UnderlayState = {
  imageUrl: null,
  opacity: 0.35,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
}

/** A calibration click pair closer than this is a mis-click, not a measurement. */
export const MIN_CALIBRATION_PIXELS = 1

export const UNDERLAY_MIN_SCALE = 0.01
export const UNDERLAY_MAX_SCALE = 100

function finite(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Keep the render alpha in 0–1; a broken value falls back to the default. */
export function clampOpacity(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_UNDERLAY.opacity
  return Math.min(1, Math.max(0, n))
}

/** Keep cm-per-pixel positive and within a sane range. */
export function clampUnderlayScale(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_UNDERLAY.scale
  return Math.min(UNDERLAY_MAX_SCALE, Math.max(UNDERLAY_MIN_SCALE, n))
}

/** Coerce a partial API/DB row into a usable underlay state. */
export function normaliseUnderlay(partial?: Partial<UnderlayState> | null): UnderlayState {
  const raw = partial ?? {}
  const url = typeof raw.imageUrl === 'string' ? raw.imageUrl.trim() : ''
  return {
    imageUrl: url.length > 0 ? url : null,
    opacity: clampOpacity(raw.opacity ?? DEFAULT_UNDERLAY.opacity),
    offsetX: finite(raw.offsetX, 0),
    offsetY: finite(raw.offsetY, 0),
    scale: clampUnderlayScale(raw.scale ?? DEFAULT_UNDERLAY.scale),
  }
}

export interface UnderlayRenderSpec {
  x: number
  y: number
  scale: number
  alpha: number
  /** The underlay is a reference only — it can never own a pointer gesture. */
  eventMode: 'none'
}

/**
 * What the canvas should draw, or null when there is nothing to show.
 * A hidden underlay or a missing image draws nothing at all.
 */
export function underlayRenderSpec(
  underlay: UnderlayState | null | undefined,
  visible: boolean,
): UnderlayRenderSpec | null {
  if (!underlay?.imageUrl || !visible) return null
  return {
    x: underlay.offsetX,
    y: underlay.offsetY,
    scale: clampUnderlayScale(underlay.scale),
    alpha: clampOpacity(underlay.opacity),
    eventMode: 'none',
  }
}

/** Image pixel → room centimetre. */
export function imageToRoom(ix: number, iy: number, underlay: UnderlayState): UnderlayPoint {
  return {
    x: underlay.offsetX + ix * underlay.scale,
    y: underlay.offsetY + iy * underlay.scale,
  }
}

/** Room centimetre → image pixel. */
export function roomToImage(rx: number, ry: number, underlay: UnderlayState): UnderlayPoint {
  const scale = underlay.scale || 1
  return {
    x: (rx - underlay.offsetX) / scale,
    y: (ry - underlay.offsetY) / scale,
  }
}

function isFinitePoint(p: UnderlayPoint | null | undefined): p is UnderlayPoint {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y)
}

/** Pixel distance between two points on the drawing. */
export function pixelDistance(a: UnderlayPoint, b: UnderlayPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Derive cm-per-pixel from two points measured on the image and the real-world
 * distance between them. Returns null for a degenerate pair (same point) or a
 * non-positive distance — there is no scale to derive from nothing.
 */
export function calibrationScale(
  p1: UnderlayPoint,
  p2: UnderlayPoint,
  realDistanceCm: number,
): number | null {
  if (!isFinitePoint(p1) || !isFinitePoint(p2)) return null
  const real = Number(realDistanceCm)
  if (!Number.isFinite(real) || real <= 0) return null
  const pixels = pixelDistance(p1, p2)
  if (!Number.isFinite(pixels) || pixels < MIN_CALIBRATION_PIXELS) return null
  return real / pixels
}

export interface CalibrationInput {
  /** Both points in image-pixel space. */
  p1: UnderlayPoint
  p2: UnderlayPoint
  realDistanceCm: number
  imageWidthPx: number
  imageHeightPx: number
  offsetX?: number
  offsetY?: number
}

export interface CalibrationResult {
  scale: number
  roomWidth: number
  roomDepth: number
}

/**
 * Calibration derives the scale and then sizes the room to the drawing's full
 * extent at that scale, so the operator can trace anywhere on the image. The
 * current offsets are kept, so an image already nudged into place stays put.
 */
export function calibrateUnderlay(input: CalibrationInput): CalibrationResult | null {
  const { imageWidthPx, imageHeightPx } = input
  if (!(Number.isFinite(imageWidthPx) && imageWidthPx > 0)) return null
  if (!(Number.isFinite(imageHeightPx) && imageHeightPx > 0)) return null

  const scale = calibrationScale(input.p1, input.p2, input.realDistanceCm)
  if (scale === null) return null

  const offsetX = finite(input.offsetX, 0)
  const offsetY = finite(input.offsetY, 0)
  return {
    scale,
    roomWidth: offsetX + imageWidthPx * scale,
    roomDepth: offsetY + imageHeightPx * scale,
  }
}

/** Compact "2.5 CM/PX" label for the editor panel. */
export function formatUnderlayScale(scale: number): string {
  if (!Number.isFinite(scale) || scale <= 0) return '—'
  const rounded = Math.round(scale * 100) / 100
  return `${rounded} CM/PX`
}
