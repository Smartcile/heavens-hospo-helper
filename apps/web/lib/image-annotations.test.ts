import { describe, it, expect } from 'vitest'
import {
  emptyAnnotation,
  annotationIsEmpty,
  normaliseAnnotation,
  arrowHead,
  annotationForUrl,
  guideStepUsageKey,
  menuItemUsageKey,
  ANNOTATION_COLOURS,
  MAX_ANNOTATION_SHAPES,
  MAX_ANNOTATION_TEXTS,
} from './image-annotations'

describe('annotationIsEmpty', () => {
  it('is true for a fresh layer and false once anything is drawn', () => {
    expect(annotationIsEmpty(emptyAnnotation())).toBe(true)
    expect(annotationIsEmpty({ shapes: [{ tool: 'pen', color: '#EF4444', width: 0.008, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }] }], texts: [] })).toBe(false)
    expect(annotationIsEmpty({ shapes: [], texts: [{ x: 0.1, y: 0.1, text: 'HI', color: '#EF4444', size: 0.045 }] })).toBe(false)
  })
})

describe('normaliseAnnotation', () => {
  it('returns empty data for garbage input', () => {
    for (const bad of [null, undefined, 42, 'nope', {}, { shapes: 'x', texts: 3 }]) {
      expect(normaliseAnnotation(bad)).toEqual({ shapes: [], texts: [] })
    }
  })

  it('keeps valid pen strokes and clamps coordinates into 0–1', () => {
    const data = normaliseAnnotation({
      shapes: [{ tool: 'pen', color: '#ef4444', width: 0.008, points: [{ x: -2, y: 0.5 }, { x: 5, y: 2 }] }],
    })
    expect(data.shapes).toHaveLength(1)
    expect(data.shapes[0].color).toBe('#EF4444')
    expect(data.shapes[0].points).toEqual([{ x: 0, y: 0.5 }, { x: 1, y: 1 }])
  })

  it('rejects unknown tools and strokes with fewer than two points', () => {
    const data = normaliseAnnotation({
      shapes: [
        { tool: 'lasso', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { tool: 'pen', points: [{ x: 0, y: 0 }] },
        { tool: 'box', points: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }] },
      ],
    })
    expect(data.shapes).toHaveLength(1)
    expect(data.shapes[0].tool).toBe('box')
  })

  it('falls back to palette colour and medium width, and caps two-point shapes', () => {
    const data = normaliseAnnotation({
      shapes: [{ tool: 'line', color: 'pink', width: 99, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 0.5 }] }],
    })
    expect(data.shapes[0]).toMatchObject({ color: ANNOTATION_COLOURS[0], width: 0.008 })
    expect(data.shapes[0].points).toHaveLength(2)
  })

  it('keeps valid texts and drops blank ones', () => {
    const data = normaliseAnnotation({
      texts: [
        { x: 0.1, y: 0.2, text: '  CHECK THIS  ', color: '#22C55E', size: 0.06 },
        { x: 0.1, y: 0.2, text: '   ' },
      ],
    })
    expect(data.texts).toHaveLength(1)
    expect(data.texts[0]).toMatchObject({ text: 'CHECK THIS', color: '#22C55E', size: 0.06 })
  })

  it('caps the number of shapes and texts', () => {
    const many = Array.from({ length: MAX_ANNOTATION_SHAPES + 50 }, () => ({
      tool: 'pen' as const,
      color: '#EF4444',
      width: 0.008,
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    }))
    const texts = Array.from({ length: MAX_ANNOTATION_TEXTS + 50 }, (_, i) => ({ x: 0, y: 0, text: `T${i}` }))
    const data = normaliseAnnotation({ shapes: many, texts })
    expect(data.shapes).toHaveLength(MAX_ANNOTATION_SHAPES)
    expect(data.texts).toHaveLength(MAX_ANNOTATION_TEXTS)
  })
})

describe('arrowHead', () => {
  it('places the tip at the target and the base behind it', () => {
    const [tip, a, b] = arrowHead({ x: 0, y: 0 }, { x: 1, y: 0 }, 0.1)
    expect(tip).toEqual({ x: 1, y: 0 })
    expect(a.x).toBeCloseTo(0.9, 5)
    expect(b.x).toBeCloseTo(0.9, 5)
    expect(Math.abs(a.y - b.y)).toBeCloseTo(0.09, 5)
  })

  it('survives a zero-length arrow', () => {
    const pts = arrowHead({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 0.1)
    expect(pts).toHaveLength(3)
    pts.forEach((p) => {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    })
  })
})

describe('usage keys + lookup', () => {
  it('builds stable, distinct keys per usage', () => {
    expect(guideStepUsageKey('s1')).toBe('guide-step:s1')
    expect(menuItemUsageKey('m1')).toBe('menu-item:m1')
  })

  it('finds the layer for one url inside a usage list', () => {
    const layers = [{ imageUrl: '/a.png', data: emptyAnnotation() }]
    expect(annotationForUrl(layers, '/a.png')).toEqual(emptyAnnotation())
    expect(annotationForUrl(layers, '/b.png')).toBeNull()
    expect(annotationForUrl(null, '/a.png')).toBeNull()
  })
})
