import { describe, it, expect } from 'vitest'
import {
  DOUBLE_TAP_SCALE,
  FIT_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  pinchScale,
  toggleZoom,
  zoomAroundPoint,
} from './pdf-zoom'

describe('clampScale', () => {
  it('leaves an in-range scale alone', () => {
    expect(clampScale(1.4)).toBe(1.4)
    expect(clampScale(MIN_SCALE)).toBe(MIN_SCALE)
    expect(clampScale(MAX_SCALE)).toBe(MAX_SCALE)
  })

  it('clamps below the minimum and above the maximum', () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE)
    expect(clampScale(99)).toBe(MAX_SCALE)
  })

  it('supports custom bounds', () => {
    expect(clampScale(5, 1, 3)).toBe(3)
    expect(clampScale(0, 1, 3)).toBe(1)
  })

  it('falls back to the minimum for non-finite input', () => {
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE)
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(MAX_SCALE)
  })
})

describe('pinchScale', () => {
  it('scales by the finger-distance ratio', () => {
    expect(pinchScale(1, 100, 200)).toBe(2)
    expect(pinchScale(2, 100, 50)).toBe(1)
    expect(pinchScale(1.4, 100, 150)).toBeCloseTo(2.1)
  })

  it('clamps to the zoom range', () => {
    expect(pinchScale(1, 10, 1000)).toBe(MAX_SCALE)
    expect(pinchScale(1, 1000, 1)).toBe(MIN_SCALE)
  })

  it('ignores a zero or negative distance', () => {
    expect(pinchScale(1.4, 0, 100)).toBe(1.4)
    expect(pinchScale(1.4, 100, 0)).toBe(1.4)
  })
})

describe('zoomAroundPoint', () => {
  it('returns the same scroll when the scale does not change', () => {
    expect(zoomAroundPoint(2, 2, { x: 40, y: 20 }, { left: 100, top: 50 })).toEqual({
      left: 100,
      top: 50,
    })
  })

  it('keeps the content point under the anchor when zooming in', () => {
    expect(zoomAroundPoint(1, 2, { x: 100, y: 50 }, { left: 0, top: 0 })).toEqual({
      left: 100,
      top: 50,
    })
    expect(zoomAroundPoint(2, 4, { x: 100, y: 50 }, { left: 100, top: 50 })).toEqual({
      left: 300,
      top: 150,
    })
  })

  it('keeps the content point under the anchor when zooming out', () => {
    expect(zoomAroundPoint(2, 1, { x: 100, y: 50 }, { left: 100, top: 50 })).toEqual({
      left: 0,
      top: 0,
    })
  })

  it('returns the original scroll for an invalid starting scale', () => {
    expect(zoomAroundPoint(0, 2, { x: 10, y: 10 }, { left: 7, top: 9 })).toEqual({
      left: 7,
      top: 9,
    })
  })
})

describe('toggleZoom', () => {
  it('zooms a fitted document to 2x', () => {
    expect(toggleZoom(FIT_SCALE)).toBe(DOUBLE_TAP_SCALE)
  })

  it('returns a zoomed document to fit', () => {
    expect(toggleZoom(DOUBLE_TAP_SCALE)).toBe(FIT_SCALE)
    expect(toggleZoom(3)).toBe(FIT_SCALE)
  })

  it('zooms in from a partial zoom', () => {
    expect(toggleZoom(1.4)).toBe(DOUBLE_TAP_SCALE)
  })
})
