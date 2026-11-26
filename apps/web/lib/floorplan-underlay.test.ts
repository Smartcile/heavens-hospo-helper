import { describe, it, expect } from 'vitest'
import {
  DEFAULT_UNDERLAY,
  MIN_CALIBRATION_PIXELS,
  UNDERLAY_MAX_SCALE,
  UNDERLAY_MIN_SCALE,
  calibrateUnderlay,
  calibrationScale,
  clampOpacity,
  clampUnderlayScale,
  formatUnderlayScale,
  imageToRoom,
  normaliseUnderlay,
  pixelDistance,
  roomToImage,
  underlayRenderSpec,
  type UnderlayState,
} from '@/lib/floorplan-underlay'

const underlay = (patch: Partial<UnderlayState> = {}): UnderlayState => ({
  ...DEFAULT_UNDERLAY,
  imageUrl: '/api/upload/drawing.png',
  ...patch,
})

describe('clampOpacity', () => {
  it('keeps a value inside 0–1', () => {
    expect(clampOpacity(0.6)).toBe(0.6)
  })

  it('clamps above 1 and below 0', () => {
    expect(clampOpacity(4)).toBe(1)
    expect(clampOpacity(-2)).toBe(0)
  })

  it('falls back to the default for a non-number', () => {
    expect(clampOpacity('nope')).toBe(DEFAULT_UNDERLAY.opacity)
    expect(clampOpacity(Number.NaN)).toBe(DEFAULT_UNDERLAY.opacity)
  })
})

describe('clampUnderlayScale', () => {
  it('keeps a positive scale', () => {
    expect(clampUnderlayScale(2.5)).toBe(2.5)
  })

  it('rejects zero, negative and non-finite scales', () => {
    expect(clampUnderlayScale(0)).toBe(DEFAULT_UNDERLAY.scale)
    expect(clampUnderlayScale(-1)).toBe(DEFAULT_UNDERLAY.scale)
    expect(clampUnderlayScale(Number.NaN)).toBe(DEFAULT_UNDERLAY.scale)
  })

  it('bounds the scale to the supported range', () => {
    expect(clampUnderlayScale(UNDERLAY_MAX_SCALE * 10)).toBe(UNDERLAY_MAX_SCALE)
    expect(clampUnderlayScale(UNDERLAY_MIN_SCALE / 10)).toBe(UNDERLAY_MIN_SCALE)
  })
})

describe('normaliseUnderlay', () => {
  it('returns documented defaults when nothing is stored', () => {
    expect(normaliseUnderlay(null)).toEqual(DEFAULT_UNDERLAY)
    expect(normaliseUnderlay(undefined)).toEqual(DEFAULT_UNDERLAY)
  })

  it('trims the image URL and treats blank as no image', () => {
    expect(normaliseUnderlay({ imageUrl: '  /api/upload/a.png  ' }).imageUrl).toBe('/api/upload/a.png')
    expect(normaliseUnderlay({ imageUrl: '   ' }).imageUrl).toBeNull()
  })

  it('coerces numeric DB values and clamps them', () => {
    const out = normaliseUnderlay({ opacity: 2, offsetX: -25, offsetY: 1.5, scale: 0 })
    expect(out.opacity).toBe(1)
    expect(out.offsetX).toBe(-25)
    expect(out.offsetY).toBe(1.5)
    expect(out.scale).toBe(DEFAULT_UNDERLAY.scale)
  })
})

describe('underlayRenderSpec', () => {
  it('returns null without an image', () => {
    expect(underlayRenderSpec(normaliseUnderlay(null), true)).toBeNull()
  })

  it('returns null when hidden', () => {
    expect(underlayRenderSpec(underlay(), false)).toBeNull()
  })

  it('maps offset, scale and opacity and never takes pointer events', () => {
    const spec = underlayRenderSpec(underlay({ offsetX: 100, offsetY: 50, scale: 2, opacity: 0.5 }), true)
    expect(spec).toEqual({ x: 100, y: 50, scale: 2, alpha: 0.5, eventMode: 'none' })
  })

  it('clamps a bad stored alpha instead of drawing an opaque drawing', () => {
    expect(underlayRenderSpec(underlay({ opacity: 9 }), true)?.alpha).toBe(1)
  })
})

describe('image ↔ room mapping', () => {
  it('round-trips a point', () => {
    const u = underlay({ offsetX: 120, offsetY: -30, scale: 2.5 })
    const room = imageToRoom(40, 80, u)
    expect(room).toEqual({ x: 220, y: 170 })
    expect(roomToImage(room.x, room.y, u)).toEqual({ x: 40, y: 80 })
  })

  it('survives a zero scale without dividing by zero', () => {
    const u = underlay({ scale: 0 })
    expect(Number.isFinite(roomToImage(10, 10, u).x)).toBe(true)
  })
})

describe('calibrationScale', () => {
  it('divides the real distance by the measured pixel distance', () => {
    expect(calibrationScale({ x: 0, y: 0 }, { x: 200, y: 0 }, 500)).toBe(2.5)
  })

  it('measures diagonals', () => {
    expect(calibrationScale({ x: 0, y: 0 }, { x: 300, y: 400 }, 1000)).toBe(2)
  })

  it('rejects a degenerate pair', () => {
    expect(calibrationScale({ x: 50, y: 50 }, { x: 50, y: 50 }, 500)).toBeNull()
    expect(calibrationScale({ x: 0, y: 0 }, { x: MIN_CALIBRATION_PIXELS / 2, y: 0 }, 500)).toBeNull()
  })

  it('rejects a zero/negative/non-finite real distance', () => {
    expect(calibrationScale({ x: 0, y: 0 }, { x: 100, y: 0 }, 0)).toBeNull()
    expect(calibrationScale({ x: 0, y: 0 }, { x: 100, y: 0 }, -10)).toBeNull()
    expect(calibrationScale({ x: 0, y: 0 }, { x: 100, y: 0 }, Number.NaN)).toBeNull()
  })

  it('rejects non-finite points', () => {
    expect(calibrationScale({ x: Number.NaN, y: 0 }, { x: 100, y: 0 }, 100)).toBeNull()
  })
})

describe('pixelDistance', () => {
  it('is Euclidean', () => {
    expect(pixelDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
})

describe('calibrateUnderlay', () => {
  it('derives the scale and sizes the room to the drawing extent', () => {
    const result = calibrateUnderlay({
      p1: { x: 0, y: 0 },
      p2: { x: 200, y: 0 },
      realDistanceCm: 400,
      imageWidthPx: 1000,
      imageHeightPx: 750,
    })
    expect(result).toEqual({ scale: 2, roomWidth: 2000, roomDepth: 1500 })
  })

  it('keeps the current offsets in the room size', () => {
    const result = calibrateUnderlay({
      p1: { x: 0, y: 0 },
      p2: { x: 100, y: 0 },
      realDistanceCm: 300,
      imageWidthPx: 400,
      imageHeightPx: 200,
      offsetX: 50,
      offsetY: 25,
    })
    expect(result).toEqual({ scale: 3, roomWidth: 1250, roomDepth: 625 })
  })

  it('rejects a missing image size', () => {
    expect(calibrateUnderlay({
      p1: { x: 0, y: 0 },
      p2: { x: 100, y: 0 },
      realDistanceCm: 300,
      imageWidthPx: 0,
      imageHeightPx: 200,
    })).toBeNull()
  })

  it('rejects a degenerate click pair', () => {
    expect(calibrateUnderlay({
      p1: { x: 10, y: 10 },
      p2: { x: 10, y: 10 },
      realDistanceCm: 300,
      imageWidthPx: 400,
      imageHeightPx: 200,
    })).toBeNull()
  })
})

describe('formatUnderlayScale', () => {
  it('renders cm per pixel', () => {
    expect(formatUnderlayScale(2.5)).toBe('2.5 CM/PX')
    expect(formatUnderlayScale(2.1234)).toBe('2.12 CM/PX')
  })

  it('renders a dash for a broken scale', () => {
    expect(formatUnderlayScale(0)).toBe('—')
    expect(formatUnderlayScale(Number.NaN)).toBe('—')
  })
})
