import { describe, it, expect } from 'vitest'
import {
  calculateSetupInventory,
  rectangleToCorners,
  unionTablePolygons,
  polygonPerimeter,
  distributeChairsAlongPerimeter,
  computeGroupChairs,
  computeEffectiveChairs,
  pointInPolygon,
  type SetupItemInput,
  type TableProfileWithBom,
  type InventoryStock,
  type RectangleTable,
} from '@/lib/floorplan-inventory'

// ── Test helpers ──

function profile(
  id: string,
  name: string,
  chairCount: number,
  seatingDensity: number | null,
  width: number,
  depth: number,
  maxHeadChairs: number,
  bomItems: { inventoryItemId: string; quantity: number; perChair: boolean }[],
): TableProfileWithBom {
  return { id, name, chairCount, seatingDensity, width, depth, maxHeadChairs, bomItems }
}

function stock(itemId: string, name: string, available: number): InventoryStock {
  return { itemId, name, available }
}

function mProfiles(p: TableProfileWithBom[]): Map<string, TableProfileWithBom> {
  return new Map(p.map((x) => [x.id, x]))
}

function mInventory(items: InventoryStock[]): Map<string, InventoryStock> {
  return new Map(items.map((i) => [i.itemId, i]))
}

function table(
  id: string,
  profileId: string,
  x: number,
  y: number,
  w = 80,
  d = 80,
  rot = 0,
  groupId?: string | null,
): SetupItemInput {
  return { id, tableProfileId: profileId, x, y, rotation: rot, width: w, depth: d, tableGroupId: groupId ?? null }
}

// ════════════════════════════════════════════════════════════
//  calculateSetupInventory
// ════════════════════════════════════════════════════════════

describe('calculateSetupInventory', () => {
  const p8 = profile('tp-8', '8-SEAT ROUND', 8, null, 80, 80, 1, [
    { inventoryItemId: 'inv-table', quantity: 1, perChair: false },
    { inventoryItemId: 'inv-chair', quantity: 1, perChair: true },
    { inventoryItemId: 'inv-fork', quantity: 1, perChair: true },
    { inventoryItemId: 'inv-salt', quantity: 1, perChair: false },
  ])

  const fullInv = mInventory([
    stock('inv-table', 'TABLE 80CM', 10),
    stock('inv-chair', 'DINING CHAIR', 80),
    stock('inv-fork', 'DINNER FORK', 80),
    stock('inv-salt', 'SALT SHAKER', 10),
  ])

  // 1
  it('returns empty array when all items are in stock', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      table(`t${i}`, 'tp-8', i * 100, 0),
    )
    expect(calculateSetupInventory(items, mProfiles([p8]), fullInv)).toEqual([])
  })

  // 2
  it('detects chair shortage while cutlery is sufficient', () => {
    const items = Array.from({ length: 4 }, (_, i) =>
      table(`t${i}`, 'tp-8', i * 100, 0),
    )
    const inv = mInventory([
      stock('inv-table', 'TABLE 80CM', 10),
      stock('inv-chair', 'DINING CHAIR', 20),
      stock('inv-fork', 'DINNER FORK', 100),
      stock('inv-salt', 'SALT SHAKER', 10),
    ])
    const r = calculateSetupInventory(items, mProfiles([p8]), inv)
    expect(r).toHaveLength(1)
    expect(r[0].itemId).toBe('inv-chair')
    expect(r[0].required).toBe(32)
    expect(r[0].available).toBe(20)
    expect(r[0].shortage).toBe(12)
  })

  // 3
  it('detects when the table physical item is out of stock', () => {
    const items = [table('t1', 'tp-8', 0, 0)]
    const inv = mInventory([
      stock('inv-table', 'TABLE 80CM', 0),
      stock('inv-chair', 'DINING CHAIR', 50),
      stock('inv-fork', 'DINNER FORK', 50),
      stock('inv-salt', 'SALT SHAKER', 10),
    ])
    const r = calculateSetupInventory(items, mProfiles([p8]), inv)
    expect(r).toHaveLength(1)
    expect(r[0].itemId).toBe('inv-table')
    expect(r[0].shortage).toBe(1)
  })

  // 4
  it('tallies correctly across mixed table types', () => {
    const p4 = profile('tp-4', '4-SEAT SQUARE', 4, null, 80, 80, 1, [
      { inventoryItemId: 'inv-chair', quantity: 1, perChair: true },
      { inventoryItemId: 'inv-fork', quantity: 1, perChair: true },
      { inventoryItemId: 'inv-salt', quantity: 1, perChair: false },
    ])
    const items = [
      table('a1', 'tp-8', 0, 0), table('a2', 'tp-8', 100, 0),
      table('b1', 'tp-4', 200, 0), table('b2', 'tp-4', 300, 0), table('b3', 'tp-4', 400, 0),
    ]
    const inv = mInventory([
      stock('inv-table', 'TABLE 80CM', 10),
      stock('inv-chair', 'DINING CHAIR', 28),
      stock('inv-fork', 'DINNER FORK', 28),
      stock('inv-salt', 'SALT SHAKER', 4),
    ])
    const r = calculateSetupInventory(items, mProfiles([p8, p4]), inv)
    expect(r).toHaveLength(1)
    expect(r[0].itemId).toBe('inv-salt')
    expect(r[0].required).toBe(5)
    expect(r[0].shortage).toBe(1)
  })

  // 5
  it('returns empty array for empty setup', () => {
    expect(calculateSetupInventory([], new Map(), new Map())).toEqual([])
  })

  // 6
  it('skips setup items with unknown profile IDs without crashing', () => {
    const items = [
      table('t1', 'tp-8', 0, 0),
      table('t2', 'tp-missing', 100, 0),
    ]
    const inv = mInventory([
      stock('inv-table', 'TABLE 80CM', 10),
      stock('inv-chair', 'DINING CHAIR', 10),
      stock('inv-fork', 'DINNER FORK', 10),
      stock('inv-salt', 'SALT SHAKER', 10),
    ])
    expect(calculateSetupInventory(items, mProfiles([p8]), inv)).toEqual([])
  })

  // 7
  it('treats missing inventory items as available=0', () => {
    const items = [table('t1', 'tp-8', 0, 0)]
    const r = calculateSetupInventory(items, mProfiles([p8]), new Map())
    expect(r).toHaveLength(4)
    const chairShortage = r.find((s) => s.itemId === 'inv-chair')
    expect(chairShortage!.available).toBe(0)
    expect(chairShortage!.shortage).toBe(8)
  })

  // 8
  it('returns multiple shortages sorted largest-first', () => {
    const items = [
      table('t1', 'tp-8', 0, 0),
      table('t2', 'tp-8', 100, 0),
    ]
    const inv = mInventory([
      stock('inv-table', 'TABLE', 10),
      stock('inv-chair', 'CHAIR', 20),
      stock('inv-fork', 'FORK', 5),
      stock('inv-salt', 'SALT', 1),
    ])
    const r = calculateSetupInventory(items, mProfiles([p8]), inv)
    expect(r).toHaveLength(2)
    expect(r[0].itemId).toBe('inv-fork')
    expect(r[0].shortage).toBe(11)
    expect(r[1].itemId).toBe('inv-salt')
    expect(r[1].shortage).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════
//  Banquet joinery — group perimeter cases
// ════════════════════════════════════════════════════════════

describe('calculateSetupInventory — banquet joinery', () => {
  const p8Dense = profile('tp-8d', '8-SEAT DENSE', 8, 60, 80, 80, 1, [
    { inventoryItemId: 'inv-table', quantity: 1, perChair: false },
    { inventoryItemId: 'inv-chair', quantity: 1, perChair: true },
    { inventoryItemId: 'inv-fork', quantity: 1, perChair: true },
    { inventoryItemId: 'inv-salt', quantity: 1, perChair: false },
  ])

  // 9
  it('two tables snapped together: reduced chairs from perimeter', () => {
    const items = [
      table('t1', 'tp-8d', 0, 0, 80, 80, 0, 'grp-1'),
      table('t2', 'tp-8d', 80, 0, 80, 80, 0, 'grp-1'),
    ]
    const inv = mInventory([
      stock('inv-table', 'TABLE', 10),
      stock('inv-chair', 'CHAIR', 8),
      stock('inv-fork', 'FORK', 8),
      stock('inv-salt', 'SALT', 10),
    ])
    expect(calculateSetupInventory(items, mProfiles([p8Dense]), inv)).toEqual([])
  })

  // 10
  it('same tables unsnapped: full chair count', () => {
    const items = [
      table('t1', 'tp-8d', 0, 0),
      table('t2', 'tp-8d', 80, 0),
    ]
    const inv = mInventory([
      stock('inv-table', 'TABLE', 10),
      stock('inv-chair', 'CHAIR', 12),
      stock('inv-fork', 'FORK', 16),
      stock('inv-salt', 'SALT', 10),
    ])
    const r = calculateSetupInventory(items, mProfiles([p8Dense]), inv)
    expect(r).toHaveLength(1)
    expect(r[0].itemId).toBe('inv-chair')
    expect(r[0].required).toBe(16)
  })

  // 11
  it('group with no seatingDensity falls back to capacity sum', () => {
    const pNoDensity = profile('tp-no', 'NO DENSITY', 8, null, 80, 80, 1, [
      { inventoryItemId: 'inv-chair', quantity: 1, perChair: true },
    ])
    const items = [
      table('t1', 'tp-no', 0, 0, 80, 80, 0, 'grp-1'),
      table('t2', 'tp-no', 80, 0, 80, 80, 0, 'grp-1'),
    ]
    const inv = mInventory([stock('inv-chair', 'CHAIR', 12)])
    const r = calculateSetupInventory(items, mProfiles([pNoDensity]), inv)
    expect(r[0].shortage).toBe(4)
  })

  // 12
  it('single table in a group behaves like solo', () => {
    const items = [table('t1', 'tp-8d', 0, 0, 80, 80, 0, 'grp-1')]
    const inv = mInventory([
      stock('inv-table', 'TABLE', 10),
      stock('inv-chair', 'CHAIR', 8),
      stock('inv-fork', 'FORK', 8),
      stock('inv-salt', 'SALT', 10),
    ])
    expect(calculateSetupInventory(items, mProfiles([p8Dense]), inv)).toEqual([])
  })

  // 13
  it('mixed profiles in a group: rejected, treated as solo', () => {
    const p4 = profile('tp-4', '4-SEAT', 4, 60, 80, 80, 1, [
      { inventoryItemId: 'inv-chair', quantity: 1, perChair: true },
    ])
    const items = [
      table('t1', 'tp-8d', 0, 0, 80, 80, 0, 'grp-1'),
      table('t2', 'tp-4', 80, 0, 80, 80, 0, 'grp-1'),
    ]
    // Mixed → split to solos. p8Dense: 8 chairs. p4: 4 chairs. Total: 12 chairs.
    const inv = mInventory([
      stock('inv-table', 'TABLE', 10),
      stock('inv-chair', 'CHAIR', 12),
      stock('inv-fork', 'FORK', 10),
      stock('inv-salt', 'SALT', 10),
    ])
    expect(calculateSetupInventory(items, mProfiles([p8Dense, p4]), inv)).toEqual([])
  })

  // 14
  it('three tables L-shape: correct perimeter chairs', () => {
    const items = [
      table('t1', 'tp-8d', 0, 0, 80, 80, 0, 'grp-1'),
      table('t2', 'tp-8d', 80, 0, 80, 80, 0, 'grp-1'),
      table('t3', 'tp-8d', 0, 80, 80, 80, 0, 'grp-1'),
    ]
    const inv = mInventory([
      stock('inv-table', 'TABLE', 10),
      stock('inv-chair', 'CHAIR', 13),
      stock('inv-fork', 'FORK', 13),
      stock('inv-salt', 'SALT', 10),
    ])
    expect(calculateSetupInventory(items, mProfiles([p8Dense]), inv)).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
//  Head-of-table chair constraint
// ════════════════════════════════════════════════════════════

describe('calculateSetupInventory — head-of-table constraint', () => {
  const pRect = profile('tp-rect', 'RECT 240×90', 12, 40, 240, 90, 1, [
    { inventoryItemId: 'inv-table', quantity: 1, perChair: false },
    { inventoryItemId: 'inv-chair', quantity: 1, perChair: true },
  ])

  // 15
  it('caps short edges of a single rectangular table', () => {
    const items = [
      { id: 't1', tableProfileId: 'tp-rect', x: 0, y: 0, width: 240, depth: 90, rotation: 0 },
    ]
    const inv = mInventory([
      stock('inv-table', 'TABLE 240×90', 10),
      stock('inv-chair', 'CHAIR', 14),
    ])
    expect(calculateSetupInventory(items, mProfiles([pRect]), inv)).toEqual([])
  })

  // 16
  it('caps composite head edge when two tables grouped side-by-side', () => {
    const items = [
      { id: 't1', tableProfileId: 'tp-rect', x: 0, y: 0, width: 240, depth: 90, rotation: 0, tableGroupId: 'g1' },
      { id: 't2', tableProfileId: 'tp-rect', x: 0, y: 90, width: 240, depth: 90, rotation: 0, tableGroupId: 'g1' },
    ]
    const inv = mInventory([
      stock('inv-table', 'TABLE', 10),
      stock('inv-chair', 'CHAIR', 16),
    ])
    expect(calculateSetupInventory(items, mProfiles([pRect]), inv)).toEqual([])
  })

  // 17
  it('square table: head constraint does not apply', () => {
    const pSquare = profile('tp-sq', 'SQUARE 80×80', 8, 60, 80, 80, 1, [
      { inventoryItemId: 'inv-chair', quantity: 1, perChair: true },
    ])
    const items = [
      { id: 't1', tableProfileId: 'tp-sq', x: 0, y: 0, width: 80, depth: 80, rotation: 0 },
    ]
    const inv = mInventory([
      stock('inv-chair', 'CHAIR', 8),
    ])
    expect(calculateSetupInventory(items, mProfiles([pSquare]), inv)).toEqual([])
  })

  // 18
  it('rotated rectangular table: head direction rotates with table', () => {
    const items = [
      { id: 't1', tableProfileId: 'tp-rect', x: 0, y: 0, width: 240, depth: 90, rotation: 90 },
    ]
    const inv = mInventory([
      stock('inv-table', 'TABLE', 10),
      stock('inv-chair', 'CHAIR', 14),
    ])
    expect(calculateSetupInventory(items, mProfiles([pRect]), inv)).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
//  rectangleToCorners
// ════════════════════════════════════════════════════════════

describe('rectangleToCorners', () => {
  // 19
  it('0deg rotation: corners match AABB', () => {
    const r: RectangleTable = { x: 0, y: 0, width: 80, depth: 60, rotation: 0 }
    const c = rectangleToCorners(r)
    expect(c[0]).toEqual([0, 0])
    expect(c[1]).toEqual([80, 0])
    expect(c[2]).toEqual([80, 60])
    expect(c[3]).toEqual([0, 60])
  })

  // 20
  it('90deg rotation: edge length preserved', () => {
    const r: RectangleTable = { x: 0, y: 0, width: 80, depth: 60, rotation: 90 }
    const c = rectangleToCorners(r)
    const dx = c[1][0] - c[0][0]
    const dy = c[1][1] - c[0][1]
    const edgeLen = Math.sqrt(dx * dx + dy * dy)
    expect(edgeLen).toBeCloseTo(80, 0)
  })

  // 21
  it('translated rectangle: all corners offset', () => {
    const r: RectangleTable = { x: 100, y: 200, width: 40, depth: 30, rotation: 0 }
    const c = rectangleToCorners(r)
    expect(c[0][0]).toBeCloseTo(100, 0)
    expect(c[0][1]).toBeCloseTo(200, 0)
    expect(c[2][0]).toBeCloseTo(140, 0)
    expect(c[2][1]).toBeCloseTo(230, 0)
  })
})

// ════════════════════════════════════════════════════════════
//  unionTablePolygons
// ════════════════════════════════════════════════════════════

describe('unionTablePolygons', () => {
  // 22
  it('empty array returns empty', () => {
    expect(unionTablePolygons([])).toEqual([])
  })

  // 23
  it('single table returns single ring', () => {
    const tables: RectangleTable[] = [{ x: 0, y: 0, width: 80, depth: 80, rotation: 0 }]
    const result = unionTablePolygons(tables)
    expect(result.length).toBe(1)
    expect(result[0].length).toBeGreaterThanOrEqual(4)
  })

  // 24
  it('two adjacent flush tables merge to single polygon', () => {
    const tables: RectangleTable[] = [
      { x: 0, y: 0, width: 80, depth: 80, rotation: 0 },
      { x: 80, y: 0, width: 80, depth: 80, rotation: 0 },
    ]
    const result = unionTablePolygons(tables)
    expect(result.length).toBe(1)
  })

  // 25
  it('two separated tables return multi-polygon', () => {
    const tables: RectangleTable[] = [
      { x: 0, y: 0, width: 80, depth: 80, rotation: 0 },
      { x: 200, y: 200, width: 80, depth: 80, rotation: 0 },
    ]
    const result = unionTablePolygons(tables)
    expect(result.length).toBe(2)
  })
})

// ════════════════════════════════════════════════════════════
//  polygonPerimeter
// ════════════════════════════════════════════════════════════

describe('polygonPerimeter', () => {
  // 26
  it('80x80 square = 320cm', () => {
    const ring: [number, number][] = [[0, 0], [80, 0], [80, 80], [0, 80], [0, 0]]
    expect(polygonPerimeter(ring)).toBeCloseTo(320, 0)
  })

  // 27
  it('120x80 rectangle = 400cm', () => {
    const ring: [number, number][] = [[0, 0], [120, 0], [120, 80], [0, 80], [0, 0]]
    expect(polygonPerimeter(ring)).toBeCloseTo(400, 0)
  })
})

// ════════════════════════════════════════════════════════════
//  computeGroupChairs + computeEffectiveChairs
// ════════════════════════════════════════════════════════════

describe('computeGroupChairs', () => {
  // 28
  it('two snapped tables: chairs based on union perimeter', () => {
    const tables: RectangleTable[] = [
      { x: 0, y: 0, width: 80, depth: 80, rotation: 0 },
      { x: 80, y: 0, width: 80, depth: 80, rotation: 0 },
    ]
    const { maxChairs, placements } = computeGroupChairs(tables, 60)
    expect(maxChairs).toBe(6)
    expect(placements.length).toBe(6)
  })

  // 29
  it('solo table with density=60 gives 4 chairs', () => {
    const tables: RectangleTable[] = [{ x: 0, y: 0, width: 80, depth: 80, rotation: 0 }]
    const { maxChairs } = computeGroupChairs(tables, 60)
    expect(maxChairs).toBe(4)
  })
})

describe('computeEffectiveChairs', () => {
  // 30
  it('group perimeter chairs capped by profile chair count', () => {
    const tables: RectangleTable[] = [
      { x: 0, y: 0, width: 80, depth: 80, rotation: 0 },
      { x: 80, y: 0, width: 80, depth: 80, rotation: 0 },
    ]
    expect(computeEffectiveChairs(tables, { chairCount: 8, seatingDensity: 60, width: 80, depth: 80, maxHeadChairs: 1 })).toBe(6)
  })

  // 31
  it('larger perimeter than profile cap: capped', () => {
    const tables: RectangleTable[] = [
      { x: 0, y: 0, width: 120, depth: 80, rotation: 0 },
      { x: 120, y: 0, width: 120, depth: 80, rotation: 0 },
    ]
    expect(computeEffectiveChairs(tables, { chairCount: 4, seatingDensity: 20, width: 120, depth: 80, maxHeadChairs: 1 })).toBe(8)
  })
})

// ════════════════════════════════════════════════════════════
//  distributeChairsAlongPerimeter
// ════════════════════════════════════════════════════════════

describe('distributeChairsAlongPerimeter', () => {
  // 32
  it('places chairs at regular intervals', () => {
    const ring: [number, number][] = [[0, 0], [80, 0], [80, 80], [0, 80], [0, 0]]
    const result = distributeChairsAlongPerimeter(ring, 60, 20)
    expect(result.length).toBe(4)
    for (const p of result) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(Number.isFinite(p.rotation)).toBe(true)
    }
  })

  // 33
  it('chairs are placed outside the polygon (positive offset)', () => {
    const ring: [number, number][] = [[0, 0], [80, 0], [80, 80], [0, 80], [0, 0]]
    const result = distributeChairsAlongPerimeter(ring, 60, 20)
    expect(result.length).toBe(4)
    const abovePolygon = result.filter((p) => p.y < 0)
    expect(abovePolygon.length).toBe(1)
  })

  // 34
  it('empty ring returns empty', () => {
    expect(distributeChairsAlongPerimeter([], 60)).toEqual([])
  })

  // 35
  it('zero or negative density returns empty', () => {
    const ring: [number, number][] = [[0, 0], [80, 0], [80, 80], [0, 80], [0, 0]]
    expect(distributeChairsAlongPerimeter(ring, 0)).toEqual([])
    expect(distributeChairsAlongPerimeter(ring, -1)).toEqual([])
  })
})

// ════════════════════════════════════════════════════════════
//  pointInPolygon
// ════════════════════════════════════════════════════════════

describe('pointInPolygon', () => {
  const rect = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
  const lShape = [
    { x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 },
    { x: 10, y: 4 }, { x: 10, y: 10 }, { x: 0, y: 10 },
  ]

  // 36
  it('point inside rectangle returns true', () => {
    expect(pointInPolygon(5, 5, rect)).toBe(true)
  })

  // 37
  it('point outside rectangle returns false', () => {
    expect(pointInPolygon(15, 5, rect)).toBe(false)
  })

  // 38
  it('point inside concave L-shape returns true', () => {
    expect(pointInPolygon(3, 7, lShape)).toBe(true)
  })

  // 39
  it('point in L-shape cutout returns false', () => {
    expect(pointInPolygon(7, 2, lShape)).toBe(false)
  })

  // 40
  it('degenerate polygon (< 3 verts) returns false', () => {
    expect(pointInPolygon(0, 0, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false)
    expect(pointInPolygon(0, 0, [])).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
//  Section boundary detection (mirrors floorplan-pixi.tsx logic)
// ════════════════════════════════════════════════════════════

function boundaryToPolygon(
  b: { x: number; y: number; width?: number | null; height?: number | null; vertices?: { x: number; y: number }[] | null; shape: string },
): { x: number; y: number }[] {
  if (b.shape === 'POLYGON' && b.vertices) {
    return b.vertices.map((v) => ({ x: b.x + v.x, y: b.y + v.y }))
  }
  return [
    { x: b.x, y: b.y },
    { x: b.x + (b.width ?? 0), y: b.y },
    { x: b.x + (b.width ?? 0), y: b.y + (b.height ?? 0) },
    { x: b.x, y: b.y + (b.height ?? 0) },
  ]
}

describe('section boundary detection', () => {
  // 41
  it('table center inside RECTANGLE boundary detected', () => {
    const boundary = { x: 100, y: 100, width: 400, height: 300, shape: 'RECTANGLE' }
    const poly = boundaryToPolygon(boundary)
    const cx = 300; const cy = 250
    expect(pointInPolygon(cx, cy, poly)).toBe(true)
  })

  // 42
  it('table center outside RECTANGLE boundary not detected', () => {
    const boundary = { x: 100, y: 100, width: 400, height: 300, shape: 'RECTANGLE' }
    const poly = boundaryToPolygon(boundary)
    const cx = 600; const cy = 250
    expect(pointInPolygon(cx, cy, poly)).toBe(false)
  })

  // 43
  it('table center on RECTANGLE boundary edge detected', () => {
    const boundary = { x: 0, y: 0, width: 200, height: 200, shape: 'RECTANGLE' }
    const poly = boundaryToPolygon(boundary)
    const cx = 100; const cy = 100
    expect(pointInPolygon(cx, cy, poly)).toBe(true)
  })

  // 44
  it('POLYGON boundary with vertices offset by x/y', () => {
    const boundary = {
      x: 50, y: 30,
      shape: 'POLYGON',
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }],
    }
    const poly = boundaryToPolygon(boundary)
    // Center at (100, 70) = world space (50+50, 30+40) — inside
    expect(pointInPolygon(100, 70, poly)).toBe(true)
    // Corner at (160, 120) = world space — outside
    expect(pointInPolygon(160, 120, poly)).toBe(false)
  })

  // 45
  it('zero-width boundary returns degenerate polygon', () => {
    const boundary = { x: 10, y: 10, width: 0, height: 0, shape: 'RECTANGLE' }
    const poly = boundaryToPolygon(boundary)
    expect(poly.length).toBe(4)
    // Point at center should be detected (degenerate area but ray casting works)
    expect(pointInPolygon(11, 11, poly)).toBe(false) // zero area = nothing inside
  })
})
