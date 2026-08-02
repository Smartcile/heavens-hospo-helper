import { describe, it, expect } from 'vitest'
import {
  normaliseRing,
  outlineOf,
  ringPerimeter,
  ringArea,
  boundsOf,
  normaliseVertices,
  wrapT,
  pointAtPerimeter,
  projectToPerimeter,
  defaultChairSlots,
  maxChairsFor,
  worldOutline,
  chairWorldPlacements,
  chairTFromWorld,
  moveChair,
  addChair,
  removeChair,
  redistributeChairs,
  validatePolygon,
  logicalEdges,
  DEFAULT_CHAIR_OFFSET,
  CIRCLE_SEGMENTS,
  type FurnitureGeometry,
  type Vertex,
} from './furniture'

const RECT: FurnitureGeometry = { shape: 'RECTANGLE', width: 120, depth: 60 }
const SQUARE: FurnitureGeometry = { shape: 'RECTANGLE', width: 100, depth: 100 }
const ROUND: FurnitureGeometry = { shape: 'CIRCLE', width: 100, depth: 100 }

/** An L-shaped booth: 200x200 bounding box with the bottom-right quarter cut out. */
const L_BOOTH: FurnitureGeometry = {
  shape: 'POLYGON',
  width: 200,
  depth: 200,
  vertices: [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 100 },
    { x: 100, y: 100 },
    { x: 100, y: 200 },
    { x: 0, y: 200 },
  ],
}

function near(a: number, b: number, tol = 1e-6) {
  expect(Math.abs(a - b)).toBeLessThan(tol)
}

describe('normaliseRing', () => {
  it('closes an open ring', () => {
    const ring = normaliseRing([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ])
    expect(ring.length).toBe(4)
    expect(ring[0]).toEqual(ring[ring.length - 1])
  })

  it('does not double-close an already closed ring', () => {
    const ring = normaliseRing([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 0 },
    ])
    expect(ring.length).toBe(4)
  })

  it('rejects fewer than 3 vertices', () => {
    expect(normaliseRing([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([])
  })

  it('winds consistently regardless of input order', () => {
    const cw = normaliseRing([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ])
    const ccw = normaliseRing([
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ])
    expect(ringArea(cw)).toBeCloseTo(ringArea(ccw))
    // Same winding direction means the same outward normals.
    const a = pointAtPerimeter(cw, 0.01)
    const b = pointAtPerimeter(ccw, 0.01)
    near(a.nx, b.nx, 1e-9)
    near(a.ny, b.ny, 1e-9)
  })
})

describe('outlineOf', () => {
  it('builds a rectangle from the bounding box', () => {
    const ring = outlineOf(RECT)
    expect(ring.length).toBe(5)
    expect(ringPerimeter(ring)).toBeCloseTo(2 * (120 + 60))
    expect(ringArea(ring)).toBeCloseTo(120 * 60)
  })

  it('approximates a circle within 1% on area', () => {
    const ring = outlineOf(ROUND)
    const expected = Math.PI * 50 * 50
    expect(Math.abs(ringArea(ring) - expected) / expected).toBeLessThan
      ? expect(Math.abs(ringArea(ring) - expected) / expected).toBeLessThan(0.01)
      : null
  })

  it('uses polygon vertices when given', () => {
    const ring = outlineOf(L_BOOTH)
    // 200x200 box minus the 100x100 cut-out
    expect(ringArea(ring)).toBeCloseTo(200 * 200 - 100 * 100)
  })

  it('falls back to the bounding box when polygon vertices are unusable', () => {
    const broken: FurnitureGeometry = { shape: 'POLYGON', width: 80, depth: 40, vertices: [{ x: 0, y: 0 }] }
    expect(ringArea(outlineOf(broken))).toBeCloseTo(80 * 40)
  })

  it('falls back to the bounding box when polygon vertices are missing', () => {
    const broken: FurnitureGeometry = { shape: 'POLYGON', width: 80, depth: 40, vertices: null }
    expect(ringArea(outlineOf(broken))).toBeCloseTo(80 * 40)
  })
})

describe('bounds and normalisation', () => {
  it('measures a bounding box', () => {
    expect(boundsOf([{ x: 5, y: 10 }, { x: 25, y: 10 }, { x: 25, y: 40 }])).toEqual({
      x: 5, y: 10, width: 20, depth: 30,
    })
  })

  it('shifts a drawn shape flush to the origin and reports its size', () => {
    const out = normaliseVertices([
      { x: 50, y: 100 },
      { x: 150, y: 100 },
      { x: 150, y: 160 },
    ])
    expect(out.width).toBe(100)
    expect(out.depth).toBe(60)
    expect(out.vertices[0]).toEqual({ x: 0, y: 0 })
    expect(Math.min(...out.vertices.map((v) => v.x))).toBe(0)
    expect(Math.min(...out.vertices.map((v) => v.y))).toBe(0)
  })

  it('handles an empty vertex list', () => {
    expect(boundsOf([])).toEqual({ x: 0, y: 0, width: 0, depth: 0 })
  })
})

describe('wrapT', () => {
  it('wraps into [0,1)', () => {
    expect(wrapT(0.25)).toBeCloseTo(0.25)
    expect(wrapT(1.25)).toBeCloseTo(0.25)
    expect(wrapT(-0.25)).toBeCloseTo(0.75)
    expect(wrapT(0)).toBe(0)
  })

  it('survives non-finite input', () => {
    expect(wrapT(NaN)).toBe(0)
    expect(wrapT(Infinity)).toBe(0)
  })
})

describe('pointAtPerimeter', () => {
  it('gives outward normals that point away from the shape', () => {
    const ring = outlineOf(SQUARE)
    // Sample all the way round; every normal must point away from the centre.
    for (let i = 0; i < 40; i++) {
      const t = i / 40
      const p = pointAtPerimeter(ring, t)
      const outX = p.x - 50
      const outY = p.y - 50
      expect(p.nx * outX + p.ny * outY).toBeGreaterThan(0)
    }
  })

  it('produces unit-length normals', () => {
    const p = pointAtPerimeter(outlineOf(L_BOOTH), 0.37)
    near(Math.hypot(p.nx, p.ny), 1, 1e-9)
  })

  it('stays on the outline for every t', () => {
    const ring = outlineOf(ROUND)
    for (let i = 0; i < 20; i++) {
      const p = pointAtPerimeter(ring, i / 20)
      // On a circle of radius 50 centred at (50,50)
      near(Math.hypot(p.x - 50, p.y - 50), 50, 0.5)
    }
  })

  it('wraps t rather than running off the end', () => {
    const ring = outlineOf(RECT)
    const a = pointAtPerimeter(ring, 0.25)
    const b = pointAtPerimeter(ring, 1.25)
    near(a.x, b.x, 1e-6)
    near(a.y, b.y, 1e-6)
  })

  it('degrades safely on an empty ring', () => {
    expect(pointAtPerimeter([], 0.5)).toEqual({ x: 0, y: 0, rotation: 0, nx: 0, ny: -1 })
  })
})

describe('projectToPerimeter', () => {
  it('is the inverse of pointAtPerimeter', () => {
    const ring = outlineOf(RECT)
    for (const t of [0.05, 0.2, 0.5, 0.77, 0.95]) {
      const p = pointAtPerimeter(ring, t)
      const back = projectToPerimeter(ring, p.x, p.y)
      near(back.t, t, 1e-6)
    }
  })

  it('snaps a point floating outside the shape back onto the edge', () => {
    const ring = outlineOf(SQUARE)
    const hit = projectToPerimeter(ring, 50, -40) // well above the top edge
    expect(hit.y).toBeCloseTo(0)
    expect(hit.x).toBeCloseTo(50)
    expect(hit.distance).toBeCloseTo(40)
  })

  it('snaps a point inside the shape to the nearest edge', () => {
    const ring = outlineOf(SQUARE)
    const hit = projectToPerimeter(ring, 10, 50) // nearest the left edge
    expect(hit.x).toBeCloseTo(0)
    expect(hit.distance).toBeCloseTo(10)
  })

  it('handles the concave corner of an L-shape', () => {
    const ring = outlineOf(L_BOOTH)
    const hit = projectToPerimeter(ring, 105, 105)
    expect(hit.distance).toBeLessThan(10)
  })
})

describe('logicalEdges', () => {
  it('keeps a rectangle as four sides', () => {
    expect(logicalEdges(outlineOf(RECT)).length).toBe(4)
  })

  it('merges a polygonised circle into one continuous side', () => {
    const edges = logicalEdges(outlineOf(ROUND))
    expect(edges.length).toBe(1)
    expect(edges[0].segments).toBe(CIRCLE_SEGMENTS)
    expect(edges[0].length).toBeCloseTo(ringPerimeter(outlineOf(ROUND)))
  })

  it('keeps the six sides of an L-shape distinct', () => {
    expect(logicalEdges(outlineOf(L_BOOTH)).length).toBe(6)
  })

  it('measures side lengths correctly', () => {
    const lengths = logicalEdges(outlineOf(RECT)).map((e) => Math.round(e.length)).sort((a, b) => a - b)
    expect(lengths).toEqual([60, 60, 120, 120])
  })

  it('merges across the closing seam, not just within the list', () => {
    // A shape whose first and last segments are collinear across the seam.
    const ring = outlineOf({
      shape: 'POLYGON', width: 100, depth: 100,
      vertices: [
        { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 },
        { x: 100, y: 100 }, { x: 0, y: 100 },
      ],
    })
    // 5 vertices but the two collinear runs collapse -> 4 real sides
    expect(logicalEdges(ring).length).toBe(4)
  })

  it('returns nothing for an empty ring', () => {
    expect(logicalEdges([])).toEqual([])
  })
})

describe('defaultChairSlots', () => {
  it('seats a 120x60 four-top along its long edges', () => {
    const chairs = defaultChairSlots(RECT, { seatingDensity: 60, maxHeadChairs: 0 })
    expect(chairs.length).toBe(4) // two per 120cm side, none on the 60cm heads
  })

  it('caps chairs on the head edges', () => {
    const wide: FurnitureGeometry = { shape: 'RECTANGLE', width: 240, depth: 120 }
    const capped = defaultChairSlots(wide, { seatingDensity: 60, maxHeadChairs: 1 })
    const uncapped = defaultChairSlots(wide, { seatingDensity: 60, maxHeadChairs: 2 })
    expect(capped.length).toBeLessThan(uncapped.length)
    expect(capped.length).toBe(4 + 4 + 1 + 1) // 4 per 240cm side, 1 per capped head
    expect(uncapped.length).toBe(4 + 4 + 2 + 2)
  })

  it('does not apply the head cap to a circle', () => {
    const chairs = defaultChairSlots(ROUND, { seatingDensity: 60, maxHeadChairs: 1 })
    // Circumference ~314cm at 60cm each — the cap must not strangle it
    expect(chairs.length).toBeGreaterThan(3)
  })

  it('does not apply the head cap to a freeform outline', () => {
    const chairs = defaultChairSlots(L_BOOTH, { seatingDensity: 60, maxHeadChairs: 1 })
    expect(chairs.length).toBeGreaterThan(4)
  })

  it('respects a capacity cap and keeps the longest edges', () => {
    const chairs = defaultChairSlots(RECT, { seatingDensity: 60, maxHeadChairs: 1, capacity: 2 })
    expect(chairs.length).toBe(2)
  })

  it('returns chairs ordered around the perimeter', () => {
    const chairs = defaultChairSlots(L_BOOTH, { seatingDensity: 50, capacity: 6 })
    const ts = chairs.map((c) => c.t)
    expect([...ts].sort((a, b) => a - b)).toEqual(ts)
  })

  it('gives every chair a distinct id and an in-range t', () => {
    const chairs = defaultChairSlots(RECT, { seatingDensity: 40 })
    expect(new Set(chairs.map((c) => c.id)).size).toBe(chairs.length)
    for (const c of chairs) {
      expect(c.t).toBeGreaterThanOrEqual(0)
      expect(c.t).toBeLessThan(1)
    }
  })

  it('seats nothing on furniture smaller than one chair', () => {
    const tiny: FurnitureGeometry = { shape: 'RECTANGLE', width: 20, depth: 20 }
    expect(defaultChairSlots(tiny, { seatingDensity: 60 })).toEqual([])
  })

  it('falls back to the default density when none is given', () => {
    expect(defaultChairSlots(RECT, { maxHeadChairs: 0 }).length).toBe(4)
  })

  it('treats a null density as unset rather than as zero', () => {
    expect(defaultChairSlots(RECT, { seatingDensity: null, maxHeadChairs: 0 }).length).toBe(4)
  })
})

describe('maxChairsFor', () => {
  it('ignores the capacity cap', () => {
    const capped = defaultChairSlots(RECT, { seatingDensity: 60, capacity: 1 })
    expect(capped.length).toBe(1)
    expect(maxChairsFor(RECT, { seatingDensity: 60, capacity: 1 })).toBeGreaterThan(1)
  })
})

describe('world placement', () => {
  it('translates an unrotated outline by x/y', () => {
    const ring = worldOutline(RECT, { x: 100, y: 200, rotation: 0 })
    const b = boundsOf(ring)
    expect(b.x).toBeCloseTo(100)
    expect(b.y).toBeCloseTo(200)
    expect(b.width).toBeCloseTo(120)
    expect(b.depth).toBeCloseTo(60)
  })

  it('rotates about the centre so the footprint stays put', () => {
    const ring = worldOutline(RECT, { x: 0, y: 0, rotation: 90 })
    const b = boundsOf(ring)
    // A 120x60 turned 90 degrees is 60x120, still centred on (60,30)
    expect(b.width).toBeCloseTo(60)
    expect(b.depth).toBeCloseTo(120)
    expect(b.x + b.width / 2).toBeCloseTo(60)
    expect(b.y + b.depth / 2).toBeCloseTo(30)
  })

  it('preserves area under rotation', () => {
    const a = ringArea(worldOutline(L_BOOTH, { x: 0, y: 0, rotation: 0 }))
    const b = ringArea(worldOutline(L_BOOTH, { x: 37, y: -12, rotation: 37 }))
    expect(b).toBeCloseTo(a, 4)
  })
})

describe('chairWorldPlacements', () => {
  it('pushes chairs outside the table edge', () => {
    const placements = chairWorldPlacements(SQUARE, { x: 0, y: 0, rotation: 0 }, [{ id: 'a', t: 0.5 }])
    const p = placements[0]
    const distFromCentre = Math.hypot(p.x - 50, p.y - 50)
    expect(distFromCentre).toBeGreaterThan(50)
  })

  it('honours a per-chair offset', () => {
    const [tight] = chairWorldPlacements(SQUARE, { x: 0, y: 0, rotation: 0 }, [{ id: 'a', t: 0.5, offset: 0 }])
    const [loose] = chairWorldPlacements(SQUARE, { x: 0, y: 0, rotation: 0 }, [{ id: 'a', t: 0.5, offset: 40 }])
    const d = Math.hypot(loose.x - tight.x, loose.y - tight.y)
    expect(d).toBeCloseTo(40)
  })

  it('uses the default offset when the chair has none', () => {
    const [c] = chairWorldPlacements(SQUARE, { x: 0, y: 0, rotation: 0 }, [{ id: 'a', t: 0 }])
    const [ref] = chairWorldPlacements(SQUARE, { x: 0, y: 0, rotation: 0 }, [{ id: 'a', t: 0, offset: 0 }])
    expect(Math.hypot(c.x - ref.x, c.y - ref.y)).toBeCloseTo(DEFAULT_CHAIR_OFFSET)
  })

  it('carries chairs with the table when it rotates', () => {
    const chairs = [{ id: 'a', t: 0.3 }]
    const still = chairWorldPlacements(SQUARE, { x: 0, y: 0, rotation: 0 }, chairs)[0]
    const spun = chairWorldPlacements(SQUARE, { x: 0, y: 0, rotation: 180 }, chairs)[0]
    // 180 degrees about (50,50) maps (x,y) -> (100-x, 100-y)
    expect(spun.x).toBeCloseTo(100 - still.x)
    expect(spun.y).toBeCloseTo(100 - still.y)
  })

  it('preserves the chair id and t', () => {
    const [c] = chairWorldPlacements(RECT, { x: 10, y: 10, rotation: 45 }, [{ id: 'seat-9', t: 0.42 }])
    expect(c.id).toBe('seat-9')
    expect(c.t).toBeCloseTo(0.42)
  })
})

describe('chairTFromWorld', () => {
  it('round-trips a chair position through world space', () => {
    const at = { x: 300, y: 150, rotation: 0 }
    for (const t of [0.1, 0.35, 0.6, 0.9]) {
      const [p] = chairWorldPlacements(RECT, at, [{ id: 'a', t }])
      near(chairTFromWorld(RECT, at, p.x, p.y), t, 1e-4)
    }
  })

  it('round-trips on a rotated table', () => {
    const at = { x: 120, y: 80, rotation: 37 }
    const [p] = chairWorldPlacements(L_BOOTH, at, [{ id: 'a', t: 0.62 }])
    near(chairTFromWorld(L_BOOTH, at, p.x, p.y), 0.62, 1e-4)
  })

  it('always returns a t in range even for a far-away drag', () => {
    const t = chairTFromWorld(RECT, { x: 0, y: 0, rotation: 0 }, 9999, -9999)
    expect(t).toBeGreaterThanOrEqual(0)
    expect(t).toBeLessThan(1)
  })
})

describe('chair set editing', () => {
  const chairs = [{ id: 'c0', t: 0.1 }, { id: 'c1', t: 0.5 }]

  it('moves one chair and leaves the others alone', () => {
    const next = moveChair(chairs, 'c1', 0.8)
    expect(next.find((c) => c.id === 'c1')!.t).toBeCloseTo(0.8)
    expect(next.find((c) => c.id === 'c0')!.t).toBeCloseTo(0.1)
  })

  it('wraps a moved chair past the seam', () => {
    expect(moveChair(chairs, 'c0', 1.2).find((c) => c.id === 'c0')!.t).toBeCloseTo(0.2)
  })

  it('ignores a move for an unknown chair', () => {
    expect(moveChair(chairs, 'nope', 0.9)).toEqual(chairs)
  })

  it('removes a chair', () => {
    expect(removeChair(chairs, 'c0').map((c) => c.id)).toEqual(['c1'])
  })

  it('adds a chair without colliding on id', () => {
    const next = addChair(chairs, 0.3)
    expect(next.length).toBe(3)
    expect(new Set(next.map((c) => c.id)).size).toBe(3)
  })

  it('keeps chairs ordered after an add', () => {
    const ts = addChair(chairs, 0.3).map((c) => c.t)
    expect([...ts].sort((a, b) => a - b)).toEqual(ts)
  })

  it('does not reuse an id already taken', () => {
    const awkward = [{ id: 'c0', t: 0.1 }, { id: 'c1', t: 0.2 }]
    // length is 2, so the naive next id "c2" is free — but check the guard too
    const withGap = [{ id: 'c0', t: 0.1 }, { id: 'c2', t: 0.2 }]
    expect(addChair(awkward, 0.5).some((c) => c.id === 'c2')).toBe(true)
    expect(new Set(addChair(withGap, 0.5).map((c) => c.id)).size).toBe(3)
  })

  it('redistributes chairs evenly while keeping the count and ids', () => {
    const messy = [
      { id: 'a', t: 0.01 },
      { id: 'b', t: 0.02 },
      { id: 'c', t: 0.03 },
      { id: 'd', t: 0.04 },
    ]
    const tidy = redistributeChairs(RECT, messy)
    expect(tidy.length).toBe(4)
    expect(tidy.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd'])
    const ts = tidy.map((c) => c.t).sort((a, b) => a - b)
    expect(ts[ts.length - 1] - ts[0]).toBeGreaterThan(0.5)
  })

  it('leaves an empty chair list alone', () => {
    expect(redistributeChairs(RECT, [])).toEqual([])
  })
})

describe('validatePolygon', () => {
  it('accepts a simple shape', () => {
    expect(validatePolygon(L_BOOTH.vertices as Vertex[])).toEqual([])
  })

  it('rejects fewer than 3 points', () => {
    expect(validatePolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toContain('A SHAPE NEEDS AT LEAST 3 POINTS')
  })

  it('rejects collinear points', () => {
    const errs = validatePolygon([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }])
    expect(errs.length).toBeGreaterThan(0)
  })

  it('rejects a self-intersecting bowtie', () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ]
    expect(validatePolygon(bowtie)).toContain('EDGES CROSS OVER EACH OTHER')
  })

  it('rejects a shape too small to place', () => {
    const speck = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }]
    expect(validatePolygon(speck)).toContain('SHAPE IS TOO SMALL TO PLACE')
  })

  it('accepts a concave but non-crossing shape', () => {
    const arrow = [
      { x: 0, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 100 },
      { x: 30, y: 50 },
    ]
    expect(validatePolygon(arrow)).toEqual([])
  })
})
