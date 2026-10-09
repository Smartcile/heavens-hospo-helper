import { describe, it, expect } from 'vitest'
import {
  emptyAnnotation,
  annotationIsEmpty,
  normaliseAnnotation,
  arrowHead,
  plotArrow,
  annotationTextBounds,
  shapeBounds,
  hitTestAnnotation,
  translateAnnotation,
  removeAnnotation,
  annotationPlateFill,
  isLightColour,
  annotationForUrl,
  guideStepUsageKey,
  menuItemUsageKey,
  ANNOTATION_COLOURS,
  MAX_ANNOTATION_SHAPES,
  MAX_ANNOTATION_TEXTS,
  type AnnotationData,
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
    expect(Math.abs(a.y - b.y)).toBeCloseTo(0.08, 5)
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

describe('plotArrow', () => {
  it('keeps the head isotropic on a non-square image', () => {
    // A horizontal arrow on a 1000×400 image: head length along x must equal
    // the stroke-scaled length, not be stretched by the image width.
    const { head } = plotArrow({ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }, 1000, 400, 0.01)
    const [tip, a, b] = head
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const headLen = Math.hypot(tip.x - mid.x, tip.y - mid.y)
    const headWidth = Math.hypot(a.x - b.x, a.y - b.y)
    expect(headLen).toBeCloseTo(0.01 * 400 * 3.6, 4)
    expect(headWidth).toBeCloseTo(headLen * 0.8, 4)
  })

  it('stops the shaft at the head base so the cap cannot blob the tip', () => {
    const { shaft, head } = plotArrow({ x: 0, y: 0 }, { x: 1, y: 0 }, 800, 800, 0.008)
    expect(shaft[0]).toEqual({ x: 0, y: 0 })
    expect(shaft[1].x).toBeCloseTo((head[1].x + head[2].x) / 2, 5)
    expect(shaft[1].x).toBeLessThan(head[0].x)
  })

  it('caps the head on very short arrows', () => {
    const { head } = plotArrow({ x: 0.5, y: 0.5 }, { x: 0.502, y: 0.5 }, 1000, 1000, 0.016)
    const [tip, a, b] = head
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    expect(Math.hypot(tip.x - mid.x, tip.y - mid.y)).toBeLessThanOrEqual(2 + 0.001)
  })
})

describe('bounds + hit testing', () => {
  const line: AnnotationData = {
    shapes: [{ tool: 'line', color: '#EF4444', width: 0.008, points: [{ x: 0.1, y: 0.1 }, { x: 0.6, y: 0.6 }] }],
    texts: [],
  }

  it('finds a stroke near its path and misses away from it', () => {
    expect(hitTestAnnotation(line, { x: 0.35, y: 0.35 }, 1000, 1000)).toEqual({ kind: 'shape', index: 0 })
    expect(hitTestAnnotation(line, { x: 0.9, y: 0.1 }, 1000, 1000)).toBeNull()
  })

  it('hits box edges (not the middle) and text boxes', () => {
    const box: AnnotationData = {
      shapes: [{ tool: 'box', color: '#EF4444', width: 0.008, points: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }] }],
      texts: [],
    }
    expect(hitTestAnnotation(box, { x: 0.5, y: 0.2 }, 1000, 1000)).toEqual({ kind: 'shape', index: 0 })
    expect(hitTestAnnotation(box, { x: 0.5, y: 0.5 }, 1000, 1000)).toBeNull()

    const withText: AnnotationData = {
      shapes: [],
      texts: [{ x: 0.3, y: 0.4, text: 'HELLO', color: '#EF4444', size: 0.05 }],
    }
    const b = annotationTextBounds(withText.texts[0], 1000, 1000)
    expect(hitTestAnnotation(withText, { x: (b.x + b.w / 2) / 1000, y: (b.y + b.h / 2) / 1000 }, 1000, 1000)).toEqual({ kind: 'text', index: 0 })
    expect(hitTestAnnotation(withText, { x: 0.9, y: 0.9 }, 1000, 1000)).toBeNull()
  })

  it('prefers the newest overlapping annotation', () => {
    const stacked: AnnotationData = {
      shapes: [
        { tool: 'line', color: '#EF4444', width: 0.008, points: [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }] },
        { tool: 'line', color: '#22C55E', width: 0.008, points: [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }] },
      ],
      texts: [],
    }
    expect(hitTestAnnotation(stacked, { x: 0.5, y: 0.5 }, 1000, 1000)).toEqual({ kind: 'shape', index: 1 })
  })
})

describe('translateAnnotation', () => {
  it('moves a shape by the pixel delta and keeps every point in 0–1', () => {
    const data: AnnotationData = {
      shapes: [{ tool: 'pen', color: '#EF4444', width: 0.008, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }],
      texts: [],
    }
    const moved = translateAnnotation(data, { kind: 'shape', index: 0 }, 100, 50, 1000, 1000)
    expect(moved.shapes[0].points[0].x).toBeCloseTo(0.2, 5)
    expect(moved.shapes[0].points[0].y).toBeCloseTo(0.15, 5)
    expect(moved.shapes[0].points[1].x).toBeCloseTo(0.3, 5)
    expect(moved.shapes[0].points[1].y).toBeCloseTo(0.25, 5)
    expect(data.shapes[0].points[0]).toEqual({ x: 0.1, y: 0.1 }) // untouched
  })

  it('clamps a shape at the image edge', () => {
    const data: AnnotationData = {
      shapes: [{ tool: 'line', color: '#EF4444', width: 0.008, points: [{ x: 0.5, y: 0.5 }, { x: 0.9, y: 0.9 }] }],
      texts: [],
    }
    const moved = translateAnnotation(data, { kind: 'shape', index: 0 }, 500, 500, 1000, 1000)
    expect(moved.shapes[0].points[1].x).toBeLessThanOrEqual(1)
    expect(moved.shapes[0].points[1].y).toBeLessThanOrEqual(1)
  })

  it('moves a text label', () => {
    const data: AnnotationData = { shapes: [], texts: [{ x: 0.2, y: 0.2, text: 'HI', color: '#EF4444', size: 0.05 }] }
    const moved = translateAnnotation(data, { kind: 'text', index: 0 }, -100, 100, 1000, 1000)
    expect(moved.texts[0].x).toBeCloseTo(0.1, 5)
    expect(moved.texts[0].y).toBeCloseTo(0.3, 5)
  })
})

describe('removeAnnotation', () => {
  it('drops the selected item only', () => {
    const data: AnnotationData = {
      shapes: [
        { tool: 'line', color: '#EF4444', width: 0.008, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        { tool: 'box', color: '#EF4444', width: 0.008, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] },
      ],
      texts: [{ x: 0, y: 0, text: 'X', color: '#EF4444', size: 0.05 }],
    }
    expect(removeAnnotation(data, { kind: 'shape', index: 0 }).shapes).toHaveLength(1)
    expect(removeAnnotation(data, { kind: 'text', index: 0 }).texts).toHaveLength(0)
  })
})

describe('text bounds + plate colour', () => {
  it('returns a positive box around the anchor', () => {
    const b = annotationTextBounds({ x: 0.5, y: 0.5, text: 'HELLO', color: '#EF4444', size: 0.05 }, 1000, 1000)
    expect(b.w).toBeGreaterThan(0)
    expect(b.h).toBeGreaterThan(0)
    expect(b.x).toBeLessThan(500)
    expect(b.y).toBeLessThan(500)
  })

  it('uses a dark plate behind light text and a light plate behind dark text', () => {
    expect(isLightColour('#FFFFFF')).toBe(true)
    expect(isLightColour('#111827')).toBe(false)
    expect(annotationPlateFill('#FFFFFF')).toContain('rgba(10,10,10')
    expect(annotationPlateFill('#EF4444')).toContain('rgba(255,255,255')
  })

  it('bounds a stroke by its points plus a stroke pad', () => {
    const b = shapeBounds({ tool: 'line', color: '#EF4444', width: 0.01, points: [{ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.7 }] }, 1000, 1000)
    expect(b.x).toBeLessThan(200)
    expect(b.y).toBeLessThan(300)
    expect(b.x + b.w).toBeGreaterThan(600)
    expect(b.y + b.h).toBeGreaterThan(700)
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
